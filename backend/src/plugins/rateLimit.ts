import RateLimit from "@fastify/rate-limit"
import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        // Il tetto per IP e' configurabile: 100/minuto bastano per l'uso normale ma
        // sono stretti per una suite e2e, che a ogni navigazione della SPA fa partire
        // un gruppo di chiamate.
        await fastify.register(RateLimit, {
            max: fastify.config.RATE_LIMIT_MAX,
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
