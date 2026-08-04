/**
 * Anonymous telemetry payload of a self-hosted installation.
 *
 * This interface is the *complete* contract: what you read here is exactly what
 * leaves the installation, there is no hidden field and nothing that can be
 * traced back to a person, a company, a project or a URL.
 *
 * Anything that is a name, an email, a hostname, a URL, an id coming from the
 * database or any free text typed by a user MUST NOT be added here.
 * See `docs/TELEMETRY.md` before touching this file.
 */
export interface TelemetryPayloadDTO {
    /** Random UUID generated on the first ping and stored in the local database. Not derived from any host or user data. */
    installationId: string
    /** Version of the orchestrator, e.g. `1.0.0`. */
    version: string
    /** Major/minor of the Node.js runtime, e.g. `24.4`. */
    nodeVersion: string
    /** Total number of projects. */
    projects: number
    /** Total number of microfrontends. */
    microfrontends: number
    /** Total number of environments. */
    environments: number
    /** Total number of user accounts. */
    users: number
    /** Deployments performed in the last 7 days. */
    deploymentsLastWeek: number
}

/** Why telemetry is on or off, so that the reason can be logged and inspected. */
export interface TelemetryDecisionDTO {
    enabled: boolean
    /** Human readable explanation, e.g. `TELEMETRY_DISABLED is set`. */
    reason: string
}

/** Response of `GET /telemetry`: lets an operator see the exact ping before it is sent. */
export interface TelemetryStatusDTO extends TelemetryDecisionDTO {
    endpoint: string
    intervalHours: number
    /** The exact payload that would be sent right now, `null` if it cannot be collected. */
    payload: TelemetryPayloadDTO | null
    /** Environment variable that turns telemetry off. */
    disableWith: string
    documentationUrl: string
}
