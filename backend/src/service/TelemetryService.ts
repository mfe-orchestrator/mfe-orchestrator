import axios from "axios"
import { randomUUID } from "crypto"
import mongoose from "mongoose"
import { version as applicationVersion } from "../../package.json"
import Configuration from "../models/ConfigurationModel"
import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import User from "../models/UserModel"
import { TelemetryPayloadDTO } from "../types/TelemetryDTO"

/** Name of the row in the `configurations` collection that holds the anonymous installation id. */
export const INSTALLATION_ID_CONFIGURATION_NAME = "TELEMETRY_INSTALLATION_ID"

const SEND_TIMEOUT_MS = 5000
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

class TelemetryService {
    /**
     * Returns the anonymous installation id, creating it on the first call.
     * The upsert keeps the id stable even when two instances of the same
     * installation ask for it at the same time.
     */
    async getInstallationId(): Promise<string> {
        const configuration = await Configuration.findOneAndUpdate({ name: INSTALLATION_ID_CONFIGURATION_NAME }, { $setOnInsert: { value: randomUUID() } }, { new: true, upsert: true })
        if (!configuration) {
            throw new Error("Unable to read or create the anonymous telemetry installation id")
        }
        return configuration.value
    }

    /** Telemetry is skipped while the database is unreachable. */
    isDatabaseReady(): boolean {
        return mongoose.connection.readyState === 1
    }

    /**
     * Builds the whole payload. Only aggregate counters are read here: adding
     * anything that identifies a person, a company or a project is a breaking
     * change of the promise made in `docs/TELEMETRY.md`.
     */
    async collect(): Promise<TelemetryPayloadDTO> {
        const [major, minor] = process.versions.node.split(".")
        const [installationId, projects, microfrontends, environments, users, deploymentsLastWeek] = await Promise.all([
            this.getInstallationId(),
            Project.estimatedDocumentCount(),
            Microfrontend.estimatedDocumentCount(),
            Environment.estimatedDocumentCount(),
            User.estimatedDocumentCount(),
            Deployment.countDocuments({ deployedAt: { $gte: new Date(Date.now() - ONE_WEEK_MS) } })
        ])

        return {
            installationId,
            version: applicationVersion,
            nodeVersion: `${major}.${minor}`,
            projects,
            microfrontends,
            environments,
            users,
            deploymentsLastWeek
        }
    }

    async send(endpoint: string, payload: TelemetryPayloadDTO): Promise<void> {
        await axios.post(endpoint, payload, {
            timeout: SEND_TIMEOUT_MS,
            headers: {
                "Content-Type": "application/json",
                "User-Agent": `mfe-orchestrator/${applicationVersion}`
            }
        })
    }
}

export default TelemetryService
