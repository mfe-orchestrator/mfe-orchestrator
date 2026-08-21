import { FastifyInstance } from "fastify"
import EnvironmentService from "../service/EnvironmentService"
import MicrofrontendService from "../service/MicrofrontendService"
import ProjectService, { ProjectCreateInput, ProjectUpdateInput } from "../service/ProjectService"

export default async function projectController(fastify: FastifyInstance) {
    // `organizationId` narrows the list to one organization, which is what the app asks for once one
    // is selected. Left out, it answers with everything the user can reach, across organizations.
    fastify.get<{ Querystring: { organizationId?: string } }>("/projects/mine", async (request, reply) => {
        const projects = await new ProjectService(request.databaseUser).findMine(request.databaseUser._id, request.query.organizationId)
        return reply.send(projects)
    })

    // Get project by ID
    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId", async (request, reply) => {
        const project = await new ProjectService(request.databaseUser).findById(request.params.projectId)
        return reply.send(project)
    })

    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId/summary", async (request, reply) => {
        return reply.send(await new ProjectService(request.databaseUser).getSummary(request.params.projectId))
    })

    // Get project by ID
    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId/environments", async (request, reply) => {
        return reply.send(await new EnvironmentService(request.databaseUser).getByProjectId(request.params.projectId))
    })

    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/microfrontends", async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).getByProjectId(request.params.projectId))
    })

    // Create new project
    fastify.post<{
        Body: ProjectCreateInput
    }>("/projects", async (request, reply) => {
        const project = await new ProjectService(request.databaseUser).create(request.body, request.databaseUser._id)
        return reply.status(201).send(project)
    })

    // Update project
    fastify.put<{
        Body: ProjectUpdateInput
        Params: {
            projectId: string
        }
    }>("/projects/:projectId", async (request, reply) => {
        const project = await new ProjectService(request.databaseUser).update(request.params.projectId, request.body)
        // The updated project itself, like every other endpoint here: this was the one route wrapping
        // its answer in an envelope, and nothing ever read it that way.
        return reply.send(project)
    })

    // Delete project
    fastify.delete<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId", async (request, reply) => {
        await new ProjectService(request.databaseUser).delete(request.params.projectId)
        return reply.status(204).send()
    })
}
