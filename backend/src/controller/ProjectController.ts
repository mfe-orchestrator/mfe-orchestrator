import { FastifyInstance } from "fastify"
import { createProjectSchema, projectIdSchema, updateProjectSchema } from "../schemas/project.schema"
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
    }>("/projects/:projectId", { schema: projectIdSchema }, async (request, reply) => {
        const project = await new ProjectService(request.databaseUser).findById(request.params.projectId)
        return reply.send(project)
    })

    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId/summary", { schema: projectIdSchema }, async (request, reply) => {
        return reply.send(await new ProjectService(request.databaseUser).getSummary(request.params.projectId))
    })

    // Get project by ID
    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId/environments", { schema: projectIdSchema }, async (request, reply) => {
        return reply.send(await new EnvironmentService(request.databaseUser).getByProjectId(request.params.projectId))
    })

    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/microfrontends", { schema: projectIdSchema }, async (request, reply) => {
        return reply.send(await new MicrofrontendService(request.databaseUser).getByProjectId(request.params.projectId))
    })

    // Create new project
    fastify.post<{
        Body: ProjectCreateInput
    }>("/projects", { schema: createProjectSchema }, async (request, reply) => {
        const project = await new ProjectService(request.databaseUser).create(request.body, request.databaseUser._id)
        return reply.status(201).send(project)
    })

    // Update project
    fastify.put<{
        Body: Partial<ProjectCreateInput> & { description?: string | null }
        Params: {
            projectId: string
        }
    }>("/projects/:projectId", { schema: updateProjectSchema }, async (request, reply) => {
        const project = await new ProjectService(request.databaseUser).update(request.params.projectId, request.body)
        return reply.send({ success: true, data: project })
    })

    // Delete project
    fastify.delete<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId", { schema: projectIdSchema }, async (request, reply) => {
        await new ProjectService(request.databaseUser).delete(request.params.projectId)
        return reply.status(204).send()
    })
}
