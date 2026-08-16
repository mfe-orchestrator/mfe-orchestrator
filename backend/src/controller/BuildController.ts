import { OutgoingHttpHeaders } from "node:http"
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import BuildStatusService from "../service/BuildStatusService"
import { getProjectIdFromRequest } from "../utils/requestUtils"

/**
 * How often the stream asks the service for a new snapshot.
 *
 * Matched to the service's own cache window: polling faster would only ever hand
 * back the cached snapshot, while polling slower would make the screen lag behind
 * a build that already finished.
 */
const POLL_INTERVAL_MS = 15_000

/**
 * Comment frames keep proxies and load balancers from closing an idle connection.
 * Sent on every poll that produced no change, so a quiet stream still writes
 * something well inside the usual 60s idle timeouts.
 */
const HEARTBEAT = ": ping\n\n"

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Starts a Server-Sent Events response on the raw socket.
 *
 * The headers Fastify and its plugins already staged on the reply (CORS, helmet)
 * are copied over: writing straight to `reply.raw` skips the serialisation path
 * where they would otherwise be applied, and dropping them would break the console
 * whenever it is served from a different origin than the API.
 */
const openEventStream = (reply: FastifyReply) => {
    reply.hijack()
    reply.raw.writeHead(200, {
        ...reply.getHeaders(),
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Without this nginx buffers the response and nothing reaches the browser
        // until the connection is closed.
        "X-Accel-Buffering": "no"
    } as OutgoingHttpHeaders)
}

const sendEvent = (reply: FastifyReply, event: string, payload: unknown) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export default async function buildController(fastify: FastifyInstance) {
    fastify.get("/builds", async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }
        return reply.send(await new BuildStatusService(request.databaseUser).getByProjectId(projectId))
    })

    /**
     * Live build status of the project, pushed as it changes.
     *
     * Only actual changes are sent: the providers are polled on a fixed interval but
     * an unchanged snapshot becomes a heartbeat instead of a full frame, so an idle
     * project costs the browser nothing to keep open.
     */
    fastify.get("/builds/stream", async (request: FastifyRequest, reply: FastifyReply) => {
        const projectId = getProjectIdFromRequest(request)
        if (!projectId) {
            throw new ProjectHeaderNotFoundError()
        }

        const service = new BuildStatusService(request.databaseUser)
        // Resolved before hijacking the reply: an access error thrown after the
        // headers are out could no longer be turned into an HTTP status.
        const firstSnapshot = await service.getByProjectId(projectId)

        openEventStream(reply)

        let closed = false
        request.raw.on("close", () => {
            closed = true
        })

        // `fetchedAt` moves on every poll, so it is excluded from the comparison:
        // leaving it in would make every snapshot look different and defeat the
        // change detection entirely.
        const fingerprint = (snapshot: unknown) => JSON.stringify({ ...(snapshot as object), fetchedAt: undefined })

        let lastFingerprint = fingerprint(firstSnapshot)
        sendEvent(reply, "snapshot", firstSnapshot)

        while (!closed) {
            await sleep(POLL_INTERVAL_MS)
            if (closed) break

            try {
                const snapshot = await service.getByProjectId(projectId)
                const current = fingerprint(snapshot)
                if (current === lastFingerprint) {
                    reply.raw.write(HEARTBEAT)
                } else {
                    lastFingerprint = current
                    sendEvent(reply, "snapshot", snapshot)
                }
            } catch (error) {
                // A provider hiccup ends this round, not the stream: the client keeps
                // showing the last snapshot and the next poll retries.
                fastify.log.warn({ err: error, projectId }, "Unable to refresh the build status stream")
                sendEvent(reply, "stream-error", { message: (error as Error)?.message })
            }
        }

        reply.raw.end()
    })
}
