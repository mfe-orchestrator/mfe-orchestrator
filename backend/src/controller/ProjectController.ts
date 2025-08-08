import { FastifyInstance } from "fastify"
import EnvironmentService from "../service/EnvironmentService"
import MicrofrontendService from "../service/MicrofrontendService"
import ProjectService, { ProjectCreateInput } from "../service/ProjectService"

export default async function projectController(fastify: FastifyInstance) {
    fastify.get("/projects/mine", async (request, reply) => {
        const projects = await new ProjectService(request.databaseUser).findMine(request.databaseUser._id)
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
        Body: Partial<ProjectCreateInput> & { description?: string | null }
        Params: {
            projectId: string
        }
    }>("/projects/:projectId", async (request, reply) => {
        const project = await new ProjectService(request.databaseUser).update(request.params.projectId, request.body)
        return reply.send({ success: true, data: project })
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
