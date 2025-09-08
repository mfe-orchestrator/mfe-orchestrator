import { DeleteResult, Types } from "mongoose"
import CodeRepository, { ICodeRepository, CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { fastify } from ".."
import GithubClient from "../client/GithubClient"
import AzureDevOpsClient from "../client/AzureDevOpsClient"
import GitLabClient from "../client/GitlabClient"

export interface CodeRepositoryCreateInput {
    name: string
    provider: CodeRepositoryProvider
    accessToken: string
    refreshToken?: string
}

export interface CodeRepositoryUpdateInput {
    name?: string
    provider?: CodeRepositoryProvider
    accessToken?: string
    refreshToken?: string
    isActive?: boolean
}

export class CodeRepositoryService extends BaseAuthorizedService {

    async getByProjectId(projectId: string): Promise<ICodeRepository[]> {
        await this.ensureAccessToProject(projectId)
        return await CodeRepository.find({ projectId, isActive: true })
                .sort({ name: 1 })
                .lean()
    }

    async findById(repositoryId: string): Promise<ICodeRepository | null> {
        const repository = await CodeRepository.findOne({ 
            _id: repositoryId 
        })
        
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        
        await this.ensureAccessToProject(repository.projectId)
        
        return repository
    }

    async create(projectId: string, repositoryData: CodeRepositoryCreateInput): Promise<ICodeRepository> {
        await this.ensureAccessToProject(projectId)

        try {
            const repository = new CodeRepository({
                name: repositoryData.name,
                provider: repositoryData.provider,
                accessToken: repositoryData.accessToken,
                refreshToken: repositoryData.refreshToken,
                projectId: new Types.ObjectId(projectId),
                isActive: true
            })

            return await repository.save()
        } catch (error: any) {
            if (error.code === 11000) {
                throw createBusinessException({
                    code: "DUPLICATE_REPOSITORY",
                    message: "A repository with this provider and name already exists",
                    statusCode: 409
                })
            }

            throw createBusinessException({
                code: "REPOSITORY_CREATION_ERROR",
                message: "Failed to create repository",
                details: { error: error.message },
                statusCode: 500
            })
        }
    }

    async update(repositoryId: string, repositoryData: CodeRepositoryUpdateInput): Promise<ICodeRepository | null> {
        await this.findById(repositoryId)

        try {
            const updated = await CodeRepository.findOneAndUpdate(
                { _id: repositoryId },
                repositoryData,
                { new: true, runValidators: true }
            ).lean()

            if (!updated) {
                throw new EntityNotFoundError(repositoryId)
            }

            return updated
        } catch (error) {
            if (error instanceof BusinessException || error instanceof EntityNotFoundError) {
                throw error
            }

            throw createBusinessException({
                code: "REPOSITORY_UPDATE_ERROR",
                message: "Failed to update repository",
                details: { error: error instanceof Error ? error.message : "Unknown error" },
                statusCode: 500
            })
        }
    }

    async delete(repositoryId: string): Promise<DeleteResult> {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }

        return await CodeRepository.deleteOne({ _id: repositoryId })
    }

    async activate(repositoryId: string): Promise<ICodeRepository | null> {
        return await this.update(repositoryId, { isActive: true })
    }

    async deactivate(repositoryId: string): Promise<ICodeRepository | null> {
        return await this.update(repositoryId, { isActive: false })
    }

    async addRepositoryGithub(code: string, state: string, projectId: string) {
        await this.ensureAccessToProject(projectId)
        const githubClient = new GithubClient()
        const responseGithub = await githubClient.getAccessToken({
            client_id: fastify.config.CODE_REPOSITORY_GITHUB_CLIENT_ID,
            client_secret: fastify.config.CODE_REPOSITORY_GITHUB_CLIENT_SECRET,
            code
        })

        const userGithub = await githubClient.getUser(responseGithub.access_token)
        const userOrganizations = await githubClient.getUserOrganizations(responseGithub.access_token)
        
        const repository = new CodeRepository({
            name: userGithub.name,
            provider: CodeRepositoryProvider.GITHUB,
            accessToken: responseGithub.access_token,
            githubData: {
                user: userGithub,
                organizations: userOrganizations
            },
            projectId: new Types.ObjectId(projectId),
            isActive: true
        })

        return await repository.save()
    }

    async addRepositoryAzure(organization: string, pat: string, projectId: string) {
        await this.ensureAccessToProject(projectId)

        const repository = new CodeRepository({
            name: organization,
            provider: CodeRepositoryProvider.AZURE_DEV_OPS,
            accessToken: pat,
            projectId: new Types.ObjectId(projectId),
            isActive: true
        })

        return await repository.save()
    }

    async testConnectionAzure(organization: string, pat: string) {
        return new AzureDevOpsClient().getProjects(pat, organization)
    }

    async addRepositoryGitlab(url: string, pat: string, projectId: string) {
        await this.ensureAccessToProject(projectId)
        
        const repository = new CodeRepository({
            name: url,
            provider: CodeRepositoryProvider.GITLAB,
            accessToken: pat,
            projectId: new Types.ObjectId(projectId),
            isActive: true
        })

        return await repository.save()
    }

    async testConnectionGitlab(url: string, pat: string) {
        return new GitLabClient(url, pat).getGroups()
    }

    async getAzureRepositories(repositoryId: string, projectId: string): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.AZURE_DEV_OPS){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not Azure DevOps",
                statusCode: 400
            })
        }
        return new AzureDevOpsClient().getRepositories(
            repository.accessToken,
            repository?.name,
            projectId
        )
    }
    async getAzureProjects(repositoryId: string): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.AZURE_DEV_OPS){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not Azure DevOps",
                statusCode: 400
            })
        }
        return new AzureDevOpsClient().getProjects(
            repository.accessToken,
            repository?.name,
        )
    }

    async getGithubOrganizations(repositoryId: string): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.GITHUB){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitHub",
                statusCode: 400
            })
        }

        return new GithubClient().getUserOrganizations(repository.accessToken)
    }

    async getGitlabGroups(repositoryId: string): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.GITLAB){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.name, repository.accessToken).getGroups()
    }

    async getGitlabPaths(repositoryId: string, groupId: number): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.GITLAB){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.name, repository.accessToken).getRepositoryPathsByGroupId(groupId)
    }

    async getGitlabRepositories(repositoryId: string, groupId: number): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.GITLAB){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.name, repository.accessToken).getRepositoriesByGroupId(groupId)
    }
}

export default CodeRepositoryService