import { DeleteResult, Types } from "mongoose"
import CodeRepository, { ICodeRepository, CodeRepositoryProvider, CodeRepositoryType } from "../models/CodeRepositoryModel"
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { fastify } from ".."
import GithubClient, { GithubBranch } from "../client/GithubClient"
import AzureDevOpsClient, { AzureDevOpsBranch, RepositoryData } from "../client/AzureDevOpsClient"
import GitLabClient from "../client/GitlabClient"
import UpdateGithubDTO from "../types/UpdateGithubDTO"
import CreateGitlabRepositoryDto from "../types/CreateGitlabRepositoryDTO"
import CreateAzureDevOpsRepositoryDTO from "../types/CreateAzureDevOpsRepositoryDTO"
import { ApiKeyService } from "./ApiKeyService"
import { ApiKeyRole } from "../models/ApiKeyModel"

export const deploySecretName = "MICROFRONTEND_ORCHESTRATOR_API_KEY"

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

export interface UnifiedBranch {
    default?: boolean;
    branch: string;
    commitSha: string;
    commitUrl: string;
    author: string | null;
    authorEmail: string | null;
    authorAvatar: string | null;
}

export class CodeRepositoryService extends BaseAuthorizedService {

    mapAzureBranch(azureBranch: AzureDevOpsBranch) {
        return {
          default: azureBranch.name === "main" || azureBranch.name === "master",
          branch: azureBranch.name.replace("refs/heads/", ""), // "refs/heads/main" -> "main"
          commitSha: azureBranch.objectId, // "objectId"
          commitUrl: azureBranch.url, // l'url alla ref
          author: azureBranch.creator?.displayName,
          authorEmail: azureBranch.creator?.uniqueName,
          authorAvatar: azureBranch.creator?._links?.avatar?.href
        };
    }

    mapGithubBranch(githubBranch: GithubBranch) {
        return {
          default: githubBranch.name === "main" || githubBranch.name === "master",
          branch: githubBranch.name,
          commitSha: githubBranch.commit?.sha,
          commitUrl: githubBranch.commit?.url,
          author: null, // GitHub branches API non porta info autore
          authorEmail: null,
          authorAvatar: null
        };
      }

    async getBranches(codeRepositoryId: string, repositoryId: string) : Promise<UnifiedBranch[]> {
        const repository = await this.findById(codeRepositoryId)
        if(!repository){
            throw new EntityNotFoundError(codeRepositoryId)
        }
        
        if(repository.provider === CodeRepositoryProvider.GITHUB){
            return new GithubClient()
                .getBranches(repository.accessToken, repositoryId, repository.githubData?.organizationId, repository.githubData?.userName)
                .then(branches => branches.map(this.mapGithubBranch))
        }
        if(repository.provider === CodeRepositoryProvider.AZURE_DEV_OPS){
            if(!repository.azureData){
                throw new BusinessException({
                    code: "INVALID_PROVIDER",
                    message: "Repository provider is not Azure DevOps",
                    statusCode: 400
                })
            }
            
            return new AzureDevOpsClient()
                .getBranches(repository.accessToken, repository.azureData.organization, repository.azureData.projectId, repositoryId)
                .then(dto => dto.value.map(this.mapAzureBranch))
        }
        if(repository.provider === CodeRepositoryProvider.GITLAB){
            //TODO da fare!!!
            //return new GitLabClient().getBranches(repository.accessToken, repositoryId)
            return []
        }

        return []
    }

    async isRepositoryNameAvailable(repositoryId: string, name: string): Promise<boolean> {
        const repositories = await this.getRepositories(repositoryId)
        if(!repositories){
            return false
        }
        return !repositories.some((repository) => repository.name === name)
    }

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

    async makeDefault(repositoryId: string){
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }

        if(repository.default) return
        
        repository.default = true
        await repository.save()
        
        await CodeRepository.updateMany(
            { _id: { $ne: repositoryId } },
            { default: false }
        )
    }

    async injectSecretsToDeployOnGithub(repository: ICodeRepository){
        if(repository.provider !== CodeRepositoryProvider.GITHUB) return;
        if(!repository.githubData?.organizationId) return;

        const githubClient = new GithubClient();

        const exists = await githubClient.checkOrganizationSecretExists({
            accessToken: repository.accessToken,
            orgName: repository.githubData.organizationId,
            secretName: deploySecretName,
            
        })

        if(exists) return;

        const apiKey = await new ApiKeyService(this.user).create(repository.projectId.toString(), {
            name: "MFE_ORCHESTRATOR_DEPLOY_SECRET - Github - " + repository.name,
            role: ApiKeyRole.MANAGER,
            expiresAt: new Date(Date.now() + 3600 * 1000 * 365)
        })

        await githubClient.upsertOrganizationSecret({
            accessToken: repository.accessToken,
            orgName: repository.githubData.organizationId,
            secretName: deploySecretName,
            visibility: 'all',
            value: apiKey.apiKey,
        })
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

            return repository.save()
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

    async updateGithub(repositoryId: string, body: UpdateGithubDTO): Promise<ICodeRepository | null> {
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

        repository.name = body.name
        repository.githubData = {
            type: body.type,
            organizationId: body.organizationId,
            userName: body.userName
        }

        const repositoryFromDb = await repository.save()

        await this.injectSecretsToDeployOnGithub(repositoryFromDb)

        return repositoryFromDb
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

    async addRepositoryGithub(code: string, state: string, projectId: string, codeRepositoryId: string) {
        await this.ensureAccessToProject(projectId)
        const githubClient = new GithubClient()
        const responseGithub = await githubClient.getAccessToken({
            client_id: fastify.config.CODE_REPOSITORY_GITHUB_CLIENT_ID,
            client_secret: fastify.config.CODE_REPOSITORY_GITHUB_CLIENT_SECRET,
            code
        })

        if(codeRepositoryId){
            return await this.update(codeRepositoryId, { accessToken: responseGithub.access_token })
        }else{        
            const userGithub = await githubClient.getUser(responseGithub.access_token)
            const repository = new CodeRepository({
                name: userGithub.name,
                provider: CodeRepositoryProvider.GITHUB,
                accessToken: responseGithub.access_token,
                projectId: new Types.ObjectId(projectId),
                isActive: true,
                githubData: {
                    type: CodeRepositoryType.PERSONAL,
                    userName: userGithub.login
                }
            })

            return await repository.save()
        }
    }

    async addRepositoryAzure(body: CreateAzureDevOpsRepositoryDTO, projectId: string) {
        await this.ensureAccessToProject(projectId)

        const repository = new CodeRepository({
            name: body.name,
            provider: CodeRepositoryProvider.AZURE_DEV_OPS,
            accessToken: body.pat,
            projectId: new Types.ObjectId(projectId),
            azureData: {
                organization: body.organization,
                projectId: body.project
            },
            githubData: undefined,
            gitlabData: undefined,
            isActive: true
        })

        return await repository.save()
    }

    async editRepositoryAzureDevOps(body: CreateAzureDevOpsRepositoryDTO, repositoryId: string) {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.AZURE_DEV_OPS){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }

        repository.name = body.name
        repository.accessToken = body.pat
        repository.gitlabData = undefined
        repository.githubData = undefined
        repository.azureData = {
            organization: body.organization,
            projectId: body.project
        }
        return await repository.save()
    }

    async testConnectionAzure(organization: string, pat: string) {
        return new AzureDevOpsClient().getProjects(pat, organization)
    }

    async addRepositoryGitlab(body: CreateGitlabRepositoryDto, projectId: string) {
        await this.ensureAccessToProject(projectId)
        
        const repository = new CodeRepository({
            name: body.name,
            provider: CodeRepositoryProvider.GITLAB,
            accessToken: body.pat,
            projectId: new Types.ObjectId(projectId),
            isActive: true,
            gitlabData: {
                url: body.url,
                project: body.project
            },
            githubData: undefined,
            azureData: undefined
        })

        return await repository.save()
    }

    async editRepositoryGitlab(body: CreateGitlabRepositoryDto, repositoryId: string) {
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

        repository.name = body.name
        repository.accessToken = body.pat
        repository.gitlabData = {
            url: body.url,
            project: body.project
        }
        repository.githubData = undefined
        repository.azureData = undefined
        return await repository.save()
    }

    async testConnectionGitlab(url: string, pat: string) {
        return new GitLabClient(url, pat).getGroups()
    }

    async getAzureRepositories(repositoryId: string, projectId: string): Promise<RepositoryData[]> {
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
        return (await new AzureDevOpsClient().getRepositories(
            repository.accessToken,
            repository?.name,
            projectId
        ))?.value
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

    async getGithubUser(repositoryId: string): Promise<unknown> {
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
        return new GithubClient().getUser(repository.accessToken)
    }

    async getGitlabGroups(repositoryId: string): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.GITLAB || !repository.gitlabData?.url){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.gitlabData?.url, repository.accessToken).getGroups()
    }

    async getGitlabPaths(repositoryId: string, groupId: number): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.GITLAB || !repository.gitlabData?.url || !repository.gitlabData?.project){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.gitlabData?.url, repository.accessToken).getRepositoryPathsByGroupId(repository.gitlabData?.project)
    }

    async getGitlabRepositories(repositoryId: string, groupId: number): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider !== CodeRepositoryProvider.GITLAB || !repository.gitlabData?.url){
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.gitlabData?.url, repository.accessToken).getRepositoriesByGroupId(groupId)
    }

    async getRepositories(repositoryId: string) {
        const repository = await this.findById(repositoryId)
        if(!repository){
            throw new EntityNotFoundError(repositoryId)
        }
        if(repository.provider === CodeRepositoryProvider.GITHUB){
            if(!repository.githubData?.type){
                throw new BusinessException({
                    code: "INVALID_PROVIDER",
                    message: "Repository provider is not GitHub",
                    statusCode: 400
                })
            }
            return new GithubClient().getRepositories(repository.accessToken, repository.githubData?.type === CodeRepositoryType.ORGANIZATION ? repository.githubData.organizationId : undefined)
        }
        if(repository.provider === CodeRepositoryProvider.GITLAB){
            if(!repository.gitlabData?.project){
                throw new BusinessException({
                    code: "INVALID_PROVIDER",
                    message: "Repository provider is not GitLab",
                    statusCode: 400
                })
            }
            return new GitLabClient(repository.gitlabData?.url, repository.accessToken).getRepositoriesByGroupId(repository.gitlabData?.project)
        }
        if(repository.provider === CodeRepositoryProvider.AZURE_DEV_OPS){
            if(!repository.azureData?.organization || !repository.azureData?.projectId){
                throw new BusinessException({
                    code: "INVALID_PROVIDER",
                    message: "Repository provider is not Azure DevOps",
                    statusCode: 400
                })
            }
            return (await new AzureDevOpsClient().getRepositories(repository.accessToken, repository.azureData?.organization, repository.azureData?.projectId))?.value
        }   
    }
}

export default CodeRepositoryService