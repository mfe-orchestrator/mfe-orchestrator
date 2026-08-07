import RateLimit from "@fastify/rate-limit"
import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        await fastify.register(RateLimit, {
            max: 100,
            timeWindow: "1 minute"
        })
        fastify.setNotFoundHandler(
            {
                preHandler: fastify.rateLimit()
            },
            function (request, reply) {
                reply.code(404).send()
            }
        )
    },
    { dependencies: ["config"] }
)
