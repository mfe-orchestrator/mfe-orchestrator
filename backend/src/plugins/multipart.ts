import fastifyMultipart from "@fastify/multipart"
import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        await fastify.register(fastifyMultipart)
    },
    { name: "multipart" }
)
