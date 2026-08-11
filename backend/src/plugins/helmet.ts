import helmet from "@fastify/helmet"
import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        fastify.register(helmet, {
            contentSecurityPolicy: false,
            global: true
        })
    },
    { name: "helmet" }
)
