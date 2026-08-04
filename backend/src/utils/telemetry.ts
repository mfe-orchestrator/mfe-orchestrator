import { TelemetryDecisionDTO, TelemetryPayloadDTO } from "../types/TelemetryDTO"

export const TELEMETRY_DEFAULT_ENDPOINT = "https://telemetry.mfe-orchestrator.dev/v1/ping"
export const TELEMETRY_DEFAULT_INTERVAL_HOURS = 24
export const TELEMETRY_DISABLE_VARIABLE = "TELEMETRY_DISABLED=true"
export const TELEMETRY_DOCUMENTATION_URL = "https://github.com/mfe-orchestrator/mfe-orchestrator/blob/main/docs/TELEMETRY.md"

/** Fields of the payload, listed at startup so that the log alone tells the whole truth. */
export const TELEMETRY_PAYLOAD_FIELDS: ReadonlyArray<keyof TelemetryPayloadDTO> = Object.freeze([
    "installationId",
    "version",
    "nodeVersion",
    "projects",
    "microfrontends",
    "environments",
    "users",
    "deploymentsLastWeek"
])

const TRUTHY_FLAGS = Object.freeze(["1", "true", "yes", "on"])
const FALSY_FLAGS = Object.freeze(["0", "false", "no", "off"])

export interface TelemetryEnvironmentFlags {
    TELEMETRY_ENABLED?: string
    TELEMETRY_DISABLED?: string
    DO_NOT_TRACK?: string
    NODE_ENV?: string
}

/**
 * Reads a flag that is allowed to be unset: an empty or unrecognized value is
 * treated as "not set" instead of failing, a telemetry switch must never keep
 * the application from booting.
 */
export const parseBooleanFlag = (value?: string): boolean | undefined => {
    const normalized = value?.trim().toLowerCase()
    if (!normalized) return undefined
    if (TRUTHY_FLAGS.includes(normalized)) return true
    if (FALSY_FLAGS.includes(normalized)) return false
    return undefined
}

/**
 * Names of the telemetry flags that are set to something we cannot read, such as
 * `TELEMETRY_DISABLED=disabled`. Those values are ignored, so the operator has
 * to be warned: they believe telemetry is off while it is still on.
 */
export const findMalformedTelemetryFlags = (env: TelemetryEnvironmentFlags): string[] => {
    const flags: Array<keyof TelemetryEnvironmentFlags> = ["TELEMETRY_ENABLED", "TELEMETRY_DISABLED", "DO_NOT_TRACK"]
    return flags.filter(flag => Boolean(env[flag]?.trim()) && parseBooleanFlag(env[flag]) === undefined)
}

/**
 * Telemetry is opt-out: it is on unless somebody turns it off. The order of the
 * checks below is documented in `docs/TELEMETRY.md` and must stay in sync with it.
 */
export const resolveTelemetryEnabled = (env: TelemetryEnvironmentFlags): TelemetryDecisionDTO => {
    const explicit = parseBooleanFlag(env.TELEMETRY_ENABLED)
    if (explicit !== undefined) {
        return { enabled: explicit, reason: `TELEMETRY_ENABLED is set to ${explicit}` }
    }
    if (parseBooleanFlag(env.TELEMETRY_DISABLED)) {
        return { enabled: false, reason: "TELEMETRY_DISABLED is set" }
    }
    if (parseBooleanFlag(env.DO_NOT_TRACK)) {
        return { enabled: false, reason: "DO_NOT_TRACK is set" }
    }
    // Developer machines, CI and test runs must not be counted as installations.
    if ((env.NODE_ENV ?? "prod") !== "prod") {
        return { enabled: false, reason: `NODE_ENV is "${env.NODE_ENV ?? "prod"}" and not "prod"` }
    }
    return { enabled: true, reason: "enabled by default (opt-out)" }
}
