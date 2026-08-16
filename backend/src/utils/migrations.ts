import { FastifyBaseLogger } from "fastify"
import { QueryFilter } from "mongoose"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Microfrontend, { CanaryType, IMicrofrontend } from "../models/MicrofrontendModel"

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

/**
 * Every data migration the application needs, run once the database connection is up.
 *
 * A failure is logged and swallowed: none of these is required for the process to serve traffic, and
 * refusing to boot over one would take the whole console down for a data fix.
 */
export const runMigrations = async (logger: FastifyBaseLogger): Promise<void> => {
    try {
        await migrateLegacyCanaryTypes(logger)
    } catch (error) {
        logger.error({ error }, "Error while running data migrations")
    }
}
