import { FastifyInstance } from "fastify"
import CodeRepositoryService, { CodeRepositoryCreateInput, CodeRepositoryUpdateInput } from "../service/CodeRepositoryService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import { getProjectIdFromRequest } from "../utils/requestUtils"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"

export default async function codeRepositoryController(fastify: FastifyInstance) {
    
    fastify.get<{
        Params: {
            projectId: string
        }
    }>("/projects/:projectId/repositories", async (request, reply) => {
        const repositories = await new CodeRepositoryService(request.databaseUser).getByProjectId(request.params.projectId)
        return reply.send(repositories)
    })

    fastify.get<{
        Params: {
            projectId: string
            repositoryId: string
        }
    }>("/repositories/:repositoryId", async (request, reply) => {
        const repository = await new CodeRepositoryService(request.databaseUser).findById(request.params.repositoryId)
        return reply.send(repository)
    })

    fastify.delete<{
        Params: {
            projectId: string
            repositoryId: string
        }
    }>('/repositories/:repositoryId', async (request, reply) => {
        await new CodeRepositoryService(request.databaseUser).delete(request.params.repositoryId)
        return reply.status(204).send()
    })

    fastify.post<{
        Params: {
            projectId: string
            repositoryId: string
        }
    }>('/repositories/:repositoryId/activate', async (request, reply) => {
        const repository = await new CodeRepositoryService(request.databaseUser).activate(request.params.repositoryId)
        return reply.send(repository)
    })

    fastify.post<{
        Params: {
            projectId: string
            repositoryId: string
        }
    }>('/repositories/:repositoryId/deactivate', async (request, reply) => {
        const repository = await new CodeRepositoryService(request.databaseUser).deactivate(request.params.repositoryId)
        return reply.send(repository)
    })

    fastify.post<{
        Body: {
            code: string
            state: string
        }
    }>('/repositories/callback/github',  async (request, reply) =>{
        const code = request.body.code
        const state = request.body.state
        const projectId = getProjectIdFromRequest(request)
        if(!projectId){
            throw new ProjectHeaderNotFoundError()
        }
        await new CodeRepositoryService(request.databaseUser).addRepositoryGithub(
            code,
            state,
            projectId
        )
        reply.send()
        
    })
}