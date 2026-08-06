import axios from "axios"
import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"
import TelemetryService from "../service/TelemetryService"
import {
    findMalformedTelemetryFlags,
    resolveTelemetryEnabled,
    TELEMETRY_DEFAULT_ENDPOINT,
    TELEMETRY_DEFAULT_INTERVAL_HOURS,
    TELEMETRY_DISABLE_VARIABLE,
    TELEMETRY_DOCUMENTATION_URL,
    TELEMETRY_PAYLOAD_FIELDS
} from "../utils/telemetry"

/** Wait before the first ping, so that builds and smoke tests are not counted as installations. */
const FIRST_PING_DELAY_MS = 60 * 1000
/** Nobody needs to ping more than once per hour, whatever the configuration says. */
const MIN_INTERVAL_HOURS = 1

/**
 * Telemetry has to be visible to whoever starts the application: the reason it
 * is on, where the ping goes, every single field it contains and how to turn it
 * off, all of it printed at boot without asking anybody to read the docs first.
 */
const logTelemetryNotice = (fastify: FastifyInstance, endpoint: string, intervalHours: number) => {
    fastify.log.info("──────────────────────────────────────────────────────────────")
    fastify.log.info(`Anonymous telemetry is ENABLED (every ${intervalHours}h to ${endpoint})`)
    fastify.log.info(`What we send, and nothing else: ${TELEMETRY_PAYLOAD_FIELDS.join(", ")}`)
    fastify.log.info("No names, no emails, no URLs, no hostnames, no IPs, no project or microfrontend content")
    fastify.log.info("Inspect the exact payload of this installation: GET /api/telemetry/status")
    fastify.log.info(`Turn it off: ${TELEMETRY_DISABLE_VARIABLE}`)
    fastify.log.info(`Full policy: ${TELEMETRY_DOCUMENTATION_URL}`)
    fastify.log.info("──────────────────────────────────────────────────────────────")
}

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        const flags = {
            TELEMETRY_ENABLED: fastify.config.TELEMETRY_ENABLED,
            TELEMETRY_DISABLED: fastify.config.TELEMETRY_DISABLED,
            DO_NOT_TRACK: fastify.config.DO_NOT_TRACK,
            NODE_ENV: fastify.config.NODE_ENV
        }
        const malformedFlags = findMalformedTelemetryFlags(flags)
        if (malformedFlags.length > 0) {
            fastify.log.warn(`Ignoring ${malformedFlags.join(", ")}: only true/false, 1/0, yes/no and on/off are understood`)
        }
        const decision = resolveTelemetryEnabled(flags)
        const endpoint = fastify.config.TELEMETRY_ENDPOINT || TELEMETRY_DEFAULT_ENDPOINT
        const intervalHours = Math.max(fastify.config.TELEMETRY_INTERVAL_HOURS || TELEMETRY_DEFAULT_INTERVAL_HOURS, MIN_INTERVAL_HOURS)

        fastify.decorate("telemetry", { ...decision, endpoint, intervalHours })

        if (!decision.enabled) {
            fastify.log.info(`Anonymous telemetry is disabled (${decision.reason})`)
            return
        }

        logTelemetryNotice(fastify, endpoint, intervalHours)

        const telemetryService = new TelemetryService()
        let isFirstPing = true

        const ping = async () => {
            if (!telemetryService.isDatabaseReady()) {
                fastify.log.debug("Skipping the telemetry ping, the database is not connected")
                return
            }
            try {
                const payload = await telemetryService.collect()
                await telemetryService.send(endpoint, payload)
                // The first ping is logged in full: the operator sees the real bytes that left the installation.
                if (isFirstPing) {
                    fastify.log.info({ payload }, "Anonymous telemetry ping sent, this is exactly what was sent")
                } else {
                    fastify.log.debug({ payload }, "Anonymous telemetry ping sent")
                }
            } catch (error) {
                // Telemetry is never allowed to affect the application: air gapped
                // installations simply keep failing and that is fine.
                const response = axios.isAxiosError(error) ? { status: error.response?.status, data: error.response?.data } : undefined
                if (isFirstPing) {
                    fastify.log.info({ error, response }, `Anonymous telemetry ping failed, the application is not affected. Set ${TELEMETRY_DISABLE_VARIABLE} to stop trying`)
                } else {
                    fastify.log.debug({ error, response }, "Anonymous telemetry ping failed")
                }
            } finally {
                isFirstPing = false
            }
        }

        const firstPingTimeout = setTimeout(ping, FIRST_PING_DELAY_MS)
        const pingInterval = setInterval(ping, intervalHours * 60 * 60 * 1000)
        // Telemetry timers must not keep the process alive on shutdown.
        firstPingTimeout.unref()
        pingInterval.unref()

        fastify.addHook("onClose", async () => {
            clearTimeout(firstPingTimeout)
            clearInterval(pingInterval)
        })
    },
    { name: "telemetry", dependencies: ["config"] }
)
