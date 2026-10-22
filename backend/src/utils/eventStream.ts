import { OutgoingHttpHeaders } from "node:http"
import { FastifyReply } from "fastify"

/**
 * Starts a Server-Sent Events response on the raw socket.
 *
 * The headers Fastify and its plugins already staged on the reply (CORS, helmet)
 * are copied over: writing straight to `reply.raw` skips the serialisation path
 * where they would otherwise be applied, and dropping them would break the console
 * whenever it is served from a different origin than the API.
 */
export const openEventStream = (reply: FastifyReply) => {
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

export const sendEvent = (reply: FastifyReply, event: string, payload: unknown) => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}
