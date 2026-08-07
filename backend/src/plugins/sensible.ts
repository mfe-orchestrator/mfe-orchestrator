import fastifySensible from "@fastify/sensible"
import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"

/**
 * This plugins adds some utilities to handle http errors
 *
 * @see https://github.com/fastify/fastify-sensible
 */
export default fastifyPlugin(async (fastify: FastifyInstance) => {
    await fastify.register(fastifySensible)
})
