import { FastifyBaseLogger } from "fastify"
import { Model, QueryFilter } from "mongoose"
import AssistantConversation from "../models/AssistantConversationModel"
import CodeRepository, { CODE_REPOSITORY_SECRET_PATHS } from "../models/CodeRepositoryModel"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Microfrontend, { CanaryType, IMicrofrontend } from "../models/MicrofrontendModel"
import Service from "../models/ServiceModel"
import Storage, { STORAGE_SECRET_PATHS } from "../models/StorageModel"
import { migrateProjectsToOrganizations } from "./organizationMigration"
import { isSecretEncryptionEnabled } from "./secretCrypto"

/**
 * Values the canary type could hold before the three current strategies replaced them. Both were the
 * same sticky percentage split and differed only in whether the identity was dropped when the browser
 * closed — ON_SESSIONS kept it in sessionStorage, COOKIE_BASED in localStorage — so both become
 * ON_SESSION, the persistent one.
 */
const LEGACY_CANARY_TYPES = ["ON_SESSIONS", "COOKIE_BASED"]

/**
 * Rewrites the canary types written by the previous model.
 *
 * It has to touch deployments as well as microfrontends: a deployment stores a snapshot of the
 * microfrontends it shipped, and that snapshot is what the serve API reads, so leaving it alone would
 * turn the canary of every already deployed environment off until the next deploy.
 *
 * Idempotent by construction — the filter only matches documents still holding a legacy value — so it
 * is safe to run on every boot, and cheap once there is nothing left to convert.
 */
export const migrateLegacyCanaryTypes = async (logger: FastifyBaseLogger): Promise<void> => {
    // Cast on the filters only: a dotted path into a subdocument is not expressible in the typed
    // QueryFilter, and spelling it out is what keeps this a single update per collection.
    const microfrontends = await Microfrontend.updateMany({ "canary.type": { $in: LEGACY_CANARY_TYPES } } as QueryFilter<IMicrofrontend>, {
        $set: { "canary.type": CanaryType.ON_SESSION }
    })

    const deployments = await Deployment.updateMany(
        { "microfrontends.canary.type": { $in: LEGACY_CANARY_TYPES } } as QueryFilter<IDeployment>,
        { $set: { "microfrontends.$[microfrontend].canary.type": CanaryType.ON_SESSION } },
        { arrayFilters: [{ "microfrontend.canary.type": { $in: LEGACY_CANARY_TYPES } }] }
    )

    if (microfrontends.modifiedCount > 0 || deployments.modifiedCount > 0) {
        logger.info(`Migrated legacy canary types on ${microfrontends.modifiedCount} microfrontend(s) and ${deployments.modifiedCount} deployment(s)`)
    }
}

/** MongoDB's codes for a collection, or an index, that does not exist. */
const NAMESPACE_NOT_FOUND = 26
const INDEX_NOT_FOUND = 27

/**
 * Removes the expiry the first version of the assistant history had: a TTL index on `expiresAt`,
 * which made MongoDB delete conversations 90 days after their last answer. Conversations are now only
 * ever deleted logically, so the index goes and the field with it.
 *
 * Mongoose creates the indexes a schema declares but never drops one it no longer declares, hence the
 * explicit drop. Idempotent: once both are gone, it costs one failed drop and one empty update.
 */
export const removeAssistantConversationExpiry = async (logger: FastifyBaseLogger): Promise<void> => {
    try {
        await AssistantConversation.collection.dropIndex("expiresAt_1")
        logger.info("Dropped the expiry index of the assistant conversations")
    } catch (error) {
        const code = (error as { code?: unknown } | null)?.code
        if (code !== NAMESPACE_NOT_FOUND && code !== INDEX_NOT_FOUND) throw error
    }
    const { modifiedCount } = await AssistantConversation.collection.updateMany({ expiresAt: { $exists: true } }, { $unset: { expiresAt: "" } })
    if (modifiedCount > 0) {
        logger.info(`Removed the expiry date of ${modifiedCount} assistant conversation(s)`)
    }
}

/** Anything not carrying the marker written by secretCrypto is still a credential in the clear. */
const NOT_ENCRYPTED = { $exists: true, $not: /^enc:v1:/ }

/**
 * Rewrites, encrypted, the credentials written before a key was configured.
 *
 * Reading them back needs no migration — a value with no marker is handed over untouched — so this is
 * only about what a dump of the database shows. It is a re-save per document and nothing else: the
 * save hook is what encrypts, and it skips whatever is already encrypted, which is what makes a second
 * run cost one empty query per collection.
 *
 * Deployments are in here because a deployment freezes a copy of the storages of its project, and the
 * serve API reads the bucket keys from that copy.
 */
const encryptStoredSecrets = async (logger: FastifyBaseLogger): Promise<void> => {
    if (!isSecretEncryptionEnabled()) return

    // The models have nothing in common but the re-save, so they are walked through the loosest
    // shape that still gives back documents to save.
    type SecretHolder = Model<Record<string, unknown>>
    type SecretFilter = QueryFilter<Record<string, unknown>>

    const anyPlaintextIn = (paths: string[]) => ({ $or: paths.map(path => ({ [path]: NOT_ENCRYPTED })) })

    const collections: Array<[string, SecretHolder, SecretFilter]> = [
        ["storage", Storage as unknown as SecretHolder, anyPlaintextIn(STORAGE_SECRET_PATHS) as SecretFilter],
        ["code repository", CodeRepository as unknown as SecretHolder, anyPlaintextIn(CODE_REPOSITORY_SECRET_PATHS) as SecretFilter],
        // $elemMatch so both halves of the criterion have to be met by the same storage of the
        // snapshot: spelled out as a dotted path, a snapshot holding one already encrypted credential
        // beside a plaintext one would satisfy neither half on the element that still needs rewriting.
        ["deployment", Deployment as unknown as SecretHolder, { storages: { $elemMatch: anyPlaintextIn(STORAGE_SECRET_PATHS) } } as SecretFilter],
        // Nested $elemMatch for the same reason, one level deeper: a secret holds a value per environment.
        ["service", Service as unknown as SecretHolder, { secrets: { $elemMatch: { values: { $elemMatch: { value: NOT_ENCRYPTED } } } } } as SecretFilter]
    ]

    for (const [label, model, filter] of collections) {
        let encrypted = 0
        for await (const document of model.find(filter).cursor()) {
            await document.save()
            encrypted++
        }

        if (encrypted > 0) {
            logger.info(`Encrypted the credentials of ${encrypted} ${label} document(s) at rest`)
        }
    }
}

/**
 * Every data migration the application needs, run once the database connection is up.
 *
 * A failure is logged and swallowed: none of these is required for the process to serve traffic, and
 * refusing to boot over one would take the whole console down for a data fix.
 */
export const runMigrations = async (logger: FastifyBaseLogger): Promise<void> => {
    try {
        // First: everything else in the application reads a project through its organization, so a
        // project still missing one would be invisible to whoever owns it.
        await migrateProjectsToOrganizations(logger)
        await migrateLegacyCanaryTypes(logger)
        await encryptStoredSecrets(logger)
        await removeAssistantConversationExpiry(logger)
    } catch (error) {
        logger.error({ error }, "Error while running data migrations")
    }
}
