import { FastifyInstance } from "fastify"
import OrganizationService, { OrganizationCreateInput, OrganizationUpdateInput } from "../service/OrganizationService"
import ProjectService from "../service/ProjectService"

export default async function organizationController(fastify: FastifyInstance) {
    // The organizations the signed-in user belongs to, with the role held in each
    fastify.get("/organizations/mine", async (request, reply) => {
        return reply.send(await new OrganizationService(request.databaseUser).findMine(request.databaseUser._id))
    })

    fastify.post<{ Body: OrganizationCreateInput }>("/organizations", async (request, reply) => {
        const organization = await new OrganizationService(request.databaseUser).create(request.body, request.databaseUser._id)
        return reply.status(201).send(organization)
    })

    fastify.get<{ Params: { organizationId: string } }>("/organizations/:organizationId", async (request, reply) => {
        return reply.send(await new OrganizationService(request.databaseUser).findById(request.params.organizationId))
    })

    fastify.get<{ Params: { organizationId: string } }>("/organizations/:organizationId/summary", async (request, reply) => {
        return reply.send(await new OrganizationService(request.databaseUser).getSummary(request.params.organizationId))
    })

    // The projects of one organization the user can actually open: everything for an owner or an
    // admin, only what they were invited to for a member.
    fastify.get<{ Params: { organizationId: string } }>("/organizations/:organizationId/projects", async (request, reply) => {
        return reply.send(await new ProjectService(request.databaseUser).findMine(request.databaseUser._id, request.params.organizationId))
    })

    fastify.put<{ Params: { organizationId: string }; Body: OrganizationUpdateInput }>("/organizations/:organizationId", async (request, reply) => {
        return reply.send(await new OrganizationService(request.databaseUser).update(request.params.organizationId, request.body))
    })

    fastify.delete<{ Params: { organizationId: string } }>("/organizations/:organizationId", async (request, reply) => {
        await new OrganizationService(request.databaseUser).delete(request.params.organizationId)
        return reply.status(204).send()
    })
}
