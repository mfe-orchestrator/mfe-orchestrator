import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"

/**
 * Restricts body parsing to JSON only.
 *
 * Fastify ships two built-in parsers, `application/json` and `text/plain`: every other
 * media type is already rejected with a 415, but `text/plain` lets a caller push an
 * arbitrary string into `request.body` on any route. Since the whole API speaks JSON, we
 * drop it and keep the default JSON parser as the only accepted one.
 *
 * Routes that legitimately receive something else (the microfrontend bundle upload)
 * register their own parser inside their own encapsulated scope.
 */
export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        fastify.removeContentTypeParser("text/plain")
    },
    { name: "contentType" }
)
