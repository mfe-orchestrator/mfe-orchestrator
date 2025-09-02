import { FastifyInstance } from "fastify"

import fastifyCors from "@fastify/cors"
import fastifyPlugin from "fastify-plugin"

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        if (!fastify.config.ALLOWED_ORIGINS) return
        fastify.log.info("CORS enabled for " +  fastify.config.ALLOWED_ORIGINS)
        const allowedOrigins = fastify.config.ALLOWED_ORIGINS.split(",")
        await fastify.register(fastifyCors, {
            origin: allowedOrigins,
            allowedHeaders: ["*"],
            credentials: true
        })
    },
    { name: "cors", dependencies: ["config"] }
)
