import { FastifyInstance } from "fastify"
import MarketService from "../service/MarketService"

export default async function marketController(fastify: FastifyInstance) {
    // Get all markets
    fastify.get("/market", async (request, reply) => {
        return reply.send(await new MarketService(request.databaseUser).getAll())
    })

    // Get single market by ID
    fastify.get<{
        Params: {
            slug: string
        }
    }>("/market/:slug", async (request, reply) => {
        return reply.send(await new MarketService(request.databaseUser).getSingle(request.params.slug))
    })
}