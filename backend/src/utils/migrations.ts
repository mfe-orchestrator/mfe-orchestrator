import { FastifyBaseLogger } from "fastify"
import { Model, ObjectId, QueryFilter } from "mongoose"
import AiChangeJob from "../models/AiChangeJobModel"
import AiChangeRequest from "../models/AiChangeRequestModel"
import AssistantConversation from "../models/AssistantConversationModel"
import CodeRepository, { CODE_REPOSITORY_SECRET_PATHS } from "../models/CodeRepositoryModel"
import Database, { DATABASE_SECRET_PATHS } from "../models/DatabaseModel"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Microfrontend, { CanaryType, IMicrofrontend } from "../models/MicrofrontendModel"
import Project, { PROJECT_SECRET_PATHS } from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import Storage, { STORAGE_SECRET_PATHS } from "../models/StorageModel"
import { IVariableMapEntry, Secret, variableMapModels } from "../models/VariableMapModel"
import { VariableMapKind } from "../types/VariableMapDTO"
import { migrateProjectsToOrganizations } from "./organizationMigration"
import { decryptSecret, isSecretEncryptionEnabled } from "./secretCrypto"

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
        ["database", Database as unknown as SecretHolder, anyPlaintextIn(DATABASE_SECRET_PATHS) as SecretFilter],
        ["project", Project as unknown as SecretHolder, anyPlaintextIn(PROJECT_SECRET_PATHS) as SecretFilter],
        // $elemMatch so both halves of the criterion have to be met by the same storage of the
        // snapshot: spelled out as a dotted path, a snapshot holding one already encrypted credential
        // beside a plaintext one would satisfy neither half on the element that still needs rewriting.
        ["deployment", Deployment as unknown as SecretHolder, { storages: { $elemMatch: anyPlaintextIn(STORAGE_SECRET_PATHS) } } as SecretFilter],
        // Nested $elemMatch for the same reason, one level deeper: a key of a secret holds a value per environment.
        ["secret", Secret as unknown as SecretHolder, { entries: { $elemMatch: { values: { $elemMatch: { value: NOT_ENCRYPTED } } } } } as SecretFilter]
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

/** A service as it was stored while it held its config map and secrets itself */
interface ServiceWithInlineVariables {
    _id: ObjectId
    projectId: ObjectId
    slug: string
    configMap?: IVariableMapEntry[] | null
    secrets?: IVariableMapEntry[] | null
}

/** What the secrets were bound to while they were encrypted inside the service: they have to be read with it */
const INLINE_SECRETS_CONTEXT = "Service:secrets.values.value"

const isDuplicateKeyError = (error: unknown): boolean => (error as { code?: number })?.code === 11000

/** The map the migration made out of one list of one service: found again by this, never by its name, which another map may hold */
const migratedFrom = (service: ServiceWithInlineVariables) => `Moved from the service ${service.slug} (${service._id})`

const extractInlineVariables = async (service: ServiceWithInlineVariables, kind: VariableMapKind, entries: IVariableMapEntry[] | null = []): Promise<ObjectId[]> => {
    if (!entries?.length) return []
    const model = variableMapModels[kind]
    const description = migratedFrom(service)
    // Left by a run that crashed before updating the service, or by another replica booting at the same time
    const findMine = () => model.findOne({ projectId: service.projectId, description }, { _id: 1 })

    const existing = await findMine()
    if (existing) return [existing._id]

    const readable =
        kind === "secret" ? entries.map(entry => ({ ...entry, values: entry.values.map(value => ({ ...value, value: decryptSecret(value.value, INLINE_SECRETS_CONTEXT) as string })) })) : entries
    // A slug may end with a dash, a Kubernetes name may not; `orders` and `orders-` would then share one
    const name = service.slug.replace(/-+$/, "")
    for (const candidate of [name, `${name}-${String(service._id).slice(-6)}`]) {
        try {
            const map = await model.create({ projectId: service.projectId, name: candidate, description, entries: readable })
            return [map._id]
        } catch (error) {
            if (!isDuplicateKeyError(error)) throw error
            const created = await findMine()
            if (created) return [created._id]
        }
    }
    throw new Error(`No free name for the ${kind} of the service ${service.slug}`)
}

/**
 * Moves the config map and the secrets a service used to hold into maps of its project, named after the
 * service and attached to it, so nothing it received is lost now that maps live on their own.
 *
 * Read and written on the raw collection: the service schema no longer knows those fields. The secrets
 * are decrypted with the context they were written under and encrypted again by the save of the new map,
 * under its own. A service that fails (a secret the key cannot read) is logged and left as it is, inline
 * values included, for the next boot: the others, and the migrations after this one, still run.
 */
export const moveServiceVariablesToMaps = async (logger: FastifyBaseLogger): Promise<void> => {
    let moved = 0
    for await (const service of Service.collection.find<ServiceWithInlineVariables>({ $or: [{ configMap: { $exists: true } }, { secrets: { $exists: true } }] })) {
        try {
            const configMapIds = await extractInlineVariables(service, "configMap", service.configMap)
            const secretIds = await extractInlineVariables(service, "secret", service.secrets)
            await Service.collection.updateOne({ _id: service._id }, { $addToSet: { configMapIds: { $each: configMapIds }, secretIds: { $each: secretIds } }, $unset: { configMap: "", secrets: "" } })
            moved++
        } catch (error) {
            logger.error({ error, serviceId: String(service._id) }, `Could not move the config map and secrets of the service ${service.slug} into maps`)
        }
    }

    if (moved > 0) {
        logger.info(`Moved the config map and secrets of ${moved} service(s) into maps of their project`)
    }
}

/** An AI change request as it was stored before it carried its conversation. */
interface AiChangeRequestLinks {
    _id: ObjectId
    jobId?: ObjectId
    parentId?: ObjectId
    conversationId?: ObjectId
}

/** How far back a request's parents are followed: as far as a job looks for the requests before it. */
const MAX_CONVERSATION_LENGTH = 50

/**
 * The conversation of a request written before requests carried one: the first job of its chain of follow-ups.
 * Once its job is gone (expired with its proposals), the oldest request still reachable through `parentId`
 * names it: a request without a parent was made by the first job of its chain. A request without a job comes
 * from before jobs and is a conversation of its own.
 */
const conversationOf = async (request: AiChangeRequestLinks): Promise<ObjectId> => {
    if (!request.jobId) return request._id
    const job = await AiChangeJob.collection.findOne<{ rootJobId: ObjectId }>({ _id: request.jobId }, { projection: { rootJobId: 1 } })
    if (job) return job.rootJobId
    let oldest = request
    for (let depth = 0; oldest.parentId && depth < MAX_CONVERSATION_LENGTH; depth++) {
        const parent = await AiChangeRequest.collection.findOne<AiChangeRequestLinks>({ _id: oldest.parentId }, { projection: { jobId: 1, parentId: 1, conversationId: 1 } })
        if (!parent) break
        if (parent.conversationId) return parent.conversationId
        oldest = parent
    }
    return oldest.jobId ?? oldest._id
}

/**
 * Gives every AI change request written before requests carried their conversation the one it belongs to:
 * the console groups the requests of a microfrontend by it. Idempotent: only the requests still without
 * one are read, so once they are all done it costs one empty query.
 */
export const backfillAiChangeConversations = async (logger: FastifyBaseLogger): Promise<void> => {
    let filled = 0
    for await (const request of AiChangeRequest.collection.find<AiChangeRequestLinks>({ conversationId: { $exists: false } }, { projection: { jobId: 1, parentId: 1 } })) {
        await AiChangeRequest.collection.updateOne({ _id: request._id }, { $set: { conversationId: await conversationOf(request) } })
        filled++
    }

    if (filled > 0) {
        logger.info(`Linked ${filled} AI change request(s) to their conversation`)
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
        // Before the encryption: whatever it moves is then covered by it
        await moveServiceVariablesToMaps(logger)
        await encryptStoredSecrets(logger)
        await removeAssistantConversationExpiry(logger)
        await backfillAiChangeConversations(logger)
    } catch (error) {
        logger.error({ error }, "Error while running data migrations")
    }
}
