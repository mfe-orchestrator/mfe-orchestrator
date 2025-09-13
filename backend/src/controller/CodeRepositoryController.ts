import { FastifyInstance } from "fastify"
import CodeRepositoryService from "../service/CodeRepositoryService"
import CreateGitlabRepositoryDto from "../types/CreateGitlabRepositoryDTO"
import { getProjectIdFromRequest } from "../utils/requestUtils"
import ProjectHeaderNotFoundError from "../errors/ProjectHeaderNotFoundError"
import UpdateGithubDTO from "../types/UpdateGithubDTO"
import CreateAzureDevOpsRepositoryDTO from "../types/CreateAzureDevOpsRepositoryDTO"

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

    fastify.get<{
        Params: {
            repositoryId: string
        }
    }>("/repositories/:repositoryId/repositories", async (request, reply) => {
        const repository = await new CodeRepositoryService(request.databaseUser).getRepositories(request.params.repositoryId)
        return reply.send(repository)
    })

    fastify.get<{
        Params: {
            repositoryId: string
        },
        Querystring: {
            name: string
        }
    }>("/repositories/:repositoryId/repositories/check-name", async (request, reply) => {
        return reply.send(await new CodeRepositoryService(request.databaseUser).isRepositoryNameAvailable(request.params.repositoryId, request.query.name))
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
        const repository = await new CodeRepositoryService(request.databaseUser).addRepositoryGithub(
            code,
            state,
            projectId
        )
        reply.send(repository)
        
    })

    fastify.put<{
        Params: {
            repositoryId: string
        }
    }>('/repositories/:repositoryId/default', async (request, reply) => {
        reply.send(await new CodeRepositoryService(request.databaseUser).makeDefault(request.params.repositoryId))
    })

    fastify.put<{
        Params: {
            repositoryId: string
        },
        Body: UpdateGithubDTO
    }>('/repositories/:repositoryId/github', async (request, reply) => {
        reply.send(await new CodeRepositoryService(request.databaseUser).updateGithub(request.params.repositoryId, request.body))
    })

    fastify.put<{
        Params: {
            repositoryId: string
        },
        Body: CreateGitlabRepositoryDto
    }>('/repositories/:repositoryId/gitlab', async (request, reply) => {
        reply.send(await new CodeRepositoryService(request.databaseUser).editRepositoryGitlab(request.body, request.params.repositoryId))
    })

    fastify.post<{
        Body: CreateAzureDevOpsRepositoryDTO
    }>('/repositories/azure',  async (request, reply) =>{
        const projectId = getProjectIdFromRequest(request)
        if(!projectId){
            throw new ProjectHeaderNotFoundError()
        }
        await new CodeRepositoryService(request.databaseUser).addRepositoryAzure(
            request.body,
            projectId
        )
        reply.send()
    })

    fastify.put<{Body: CreateAzureDevOpsRepositoryDTO, Params: {repositoryId: string}}>('/repositories/:repositoryId/azure',  async (request, reply) =>{        
        await new CodeRepositoryService(request.databaseUser).editRepositoryAzureDevOps(request.body, request.params.repositoryId)
        reply.send()
    })
    

    fastify.post<{Body: {organization: string, pat: string}}>('/repositories/azure/test',  async (request, reply) =>{
        const result = await new CodeRepositoryService(request.databaseUser).testConnectionAzure(
            request.body.organization,
            request.body.pat
        )
        reply.send(result)
    })

    fastify.post<{ Body: CreateGitlabRepositoryDto }>('/repositories/gitlab',  async (request, reply) => {
        const projectId = getProjectIdFromRequest(request)
        if(!projectId){
            throw new ProjectHeaderNotFoundError()
        }
        await new CodeRepositoryService(request.databaseUser).addRepositoryGitlab(
            request.body,
            projectId
        )
        reply.send()
    })

    fastify.post<{Body: {url: string, pat: string}}>('/repositories/gitlab/test',  async (request, reply) =>{
        const result = await new CodeRepositoryService(request.databaseUser).testConnectionGitlab(
            request.body.url,
            request.body.pat
        )
        reply.send(result)
    })

    fastify.get<{Params: {repositoryId: string}}>('/repositories/:repositoryId/github/organizations',  async (request, reply) =>{
        reply.send(await new CodeRepositoryService(request.databaseUser).getGithubOrganizations(
            request.params.repositoryId
        ))
    })

    fastify.get<{Params: {repositoryId: string}}>('/repositories/:repositoryId/github/user',  async (request, reply) =>{
        reply.send(await new CodeRepositoryService(request.databaseUser).getGithubUser(
            request.params.repositoryId
        ))
    })

    fastify.get<{Params: {repositoryId: string}}>('/repositories/:repositoryId/azure/projects',  async (request, reply) =>{
        reply.send(await new CodeRepositoryService(request.databaseUser).getAzureProjects(
            request.params.repositoryId
        ))
    })

    fastify.get<{Params: {repositoryId: string, projectId: string}}>('/repositories/:repositoryId/azure/projects/:projectId/repositories',  async (request, reply) =>{
        reply.send(await new CodeRepositoryService(request.databaseUser).getAzureRepositories(
            request.params.repositoryId,
            request.params.projectId
        ))
    })

    fastify.get<{Params: {repositoryId: string}}>('/repositories/:repositoryId/gitlab/groups',  async (request, reply) =>{
        reply.send(await new CodeRepositoryService(request.databaseUser).getGitlabGroups(
            request.params.repositoryId
        ))
    })

    fastify.get<{Params: {repositoryId: string, groupId: string}}>('/repositories/:repositoryId/gitlab/groups/:groupId/paths',  async (request, reply) =>{
        reply.send(await new CodeRepositoryService(request.databaseUser).getGitlabPaths(
            request.params.repositoryId,
            parseInt(request.params.groupId,10)
        ))
    })

    fastify.get<{Params: {repositoryId: string, groupId: string}}>('/repositories/:repositoryId/gitlab/groups/:groupId/repositories',  async (request, reply) =>{
        reply.send(await new CodeRepositoryService(request.databaseUser).getGitlabRepositories(
            request.params.repositoryId,
            parseInt(request.params.groupId,10)
        ))
    })

    fastify.post<{
        Params: {repositoryId: string, projectId: string}, 
        Body: {repositoryName: string}
    }>('/repositories/:repositoryId/azure/projects/:projectId/repositories/check-name',  async (request, reply) =>{
        const repositories = await new CodeRepositoryService(request.databaseUser).getAzureRepositories(
            request.params.repositoryId,
            request.params.projectId
        ) as any[]
        const isAvailable = !repositories.some((repo: any) => repo.name.toLowerCase() === request.body.repositoryName.toLowerCase())
        reply.send({ available: isAvailable })
    })

}