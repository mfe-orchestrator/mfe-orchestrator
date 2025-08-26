import fastifyPlugin from "fastify-plugin"
import { FastifyInstance } from "fastify"
import { createClient, RedisClientType } from "@redis/client"

export let redisClient: RedisClientType

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        if (!fastify.config.REDIS_URL) {
            fastify.log.warn("Cannot see redis URL, will not connect")
            return
        }

        try {
            redisClient = createClient({
                url: fastify.config.REDIS_URL,
                password: fastify.config.REDIS_PASSWORD,
                username: "default"
            })

            await redisClient.connect()

            fastify.addHook("onClose", async () => {
                redisClient.destroy()
            })
        } catch (exception) {
            console.error("Error starting Redis")
            console.error(exception)
        }
    },
    { dependencies: ["config"] }
)
