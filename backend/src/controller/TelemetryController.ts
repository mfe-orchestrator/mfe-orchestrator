import { FastifyInstance } from "fastify"
import TelemetryService from "../service/TelemetryService"
import { TelemetryStatusDTO } from "../types/TelemetryDTO"
import { TELEMETRY_DISABLE_VARIABLE, TELEMETRY_DOCUMENTATION_URL } from "../utils/telemetry"

export default async function telemetryController(fastify: FastifyInstance) {
    const telemetryService = new TelemetryService()

    /**
     * Lets an operator see the telemetry configuration and the exact payload
     * that would leave this installation, without having to trust the docs.
     */
    fastify.get("/telemetry/status", async (request, reply) => {
        const { enabled, reason, endpoint, intervalHours } = fastify.telemetry
        const response: TelemetryStatusDTO = {
            enabled,
            reason,
            endpoint,
            intervalHours,
            payload: telemetryService.isDatabaseReady() ? await telemetryService.collect() : null,
            disableWith: TELEMETRY_DISABLE_VARIABLE,
            documentationUrl: TELEMETRY_DOCUMENTATION_URL
        }
        return reply.send(response)
    })
}
