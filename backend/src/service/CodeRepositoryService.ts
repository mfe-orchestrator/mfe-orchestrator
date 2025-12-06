import { ClientSession, DeleteResult, Types } from "mongoose"
import { fastify } from ".."
import AzureDevOpsClient, { AzureDevOpsBranch, RepositoryData } from "../client/AzureDevOpsClient"
import GithubClient, { GithubBranch } from "../client/GithubClient"
import GitLabClient from "../client/GitlabClient"
import { BusinessException, createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { ApiKeyRole } from "../models/ApiKeyModel"
import CodeRepository, { CodeRepositoryProvider, CodeRepositoryType, ICodeRepository } from "../models/CodeRepositoryModel"
import CreateAzureDevOpsRepositoryDTO from "../types/CreateAzureDevOpsRepositoryDTO"
import CreateGitlabRepositoryDto from "../types/CreateGitlabRepositoryDTO"
import UpdateGithubDTO from "../types/UpdateGithubDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { runInTransaction } from "../utils/runInTransaction"
import { ApiKeyService } from "./ApiKeyService"
import BaseAuthorizedService from "./BaseAuthorizedService"

export const deploySecretName = "MICROFRONTEND_ORCHESTRATOR_API_KEY"
export const azureDevOpsVariableGroupName = "MFE_ORCHESTRATOR_SECRETS"

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
    default?: boolean
    branch: string
    commitSha: string
    commitUrl: string
    author: string | null
    authorEmail: string | null
    authorAvatar: string | null
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
        }
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
        }
    }

    async getBranches(codeRepositoryId: string, repositoryId: string): Promise<UnifiedBranch[]> {
        const repository = await this.findById(codeRepositoryId)
        if (!repository) {
            throw new EntityNotFoundError(codeRepositoryId)
        }

        if (repository.provider === CodeRepositoryProvider.GITHUB) {
            return new GithubClient()
                .getBranches(repository.accessToken, repositoryId, repository.githubData?.organizationId, repository.githubData?.userName)
                .then(branches => branches.map(this.mapGithubBranch))
        }
        if (repository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
            if (!repository.azureData) {
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
        if (repository.provider === CodeRepositoryProvider.GITLAB) {
            //TODO da fare!!!
            //return new GitLabClient().getBranches(repository.accessToken, repositoryId)
            return []
        }

        return []
    }

    async isRepositoryNameAvailable(repositoryId: string, name: string, groupPath?: string, groupId?: number): Promise<boolean> {
        const repositories = await this.getRepositories(repositoryId, groupPath, groupId)
        if (!repositories) {
            return false
        }
        return !repositories.some(repository => repository.name === name)
    }

    async getByProjectId(projectId: string): Promise<ICodeRepository[]> {
        await this.ensureAccessToProject(projectId)
        console.log(projectId, toObjectId(projectId))
        return await CodeRepository.find({ projectId: toObjectId(projectId), isActive: true }).sort({
            name: 1
        })
    }

    async findById(repositoryId: string, session?: ClientSession): Promise<ICodeRepository | null> {
        const repository = await CodeRepository.findOne(
            {
                _id: toObjectId(repositoryId)
            },
            {},
            { session }
        )

        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }

        await this.ensureAccessToProject(repository.projectId)

        return repository
    }

    async makeDefault(repositoryId: string) {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }

        if (repository.default) return

        repository.default = true
        await repository.save()

        await CodeRepository.updateMany({ _id: { $ne: toObjectId(repositoryId) } }, { default: false })
    }

    async injectSecretsToDeployOnGitlabRaw(repository: ICodeRepository, session?: ClientSession) {
        if (repository.provider !== CodeRepositoryProvider.GITLAB) return
        if (!repository.gitlabData?.groupId) return

        const gitlabClient = new GitLabClient(repository.gitlabData.url, repository.accessToken)

        const exists = await gitlabClient.checkGroupSecretExists({
            groupId: repository.gitlabData.groupId,
            secretName: deploySecretName
        })

        if (exists) return

        const apiKey = await new ApiKeyService(this.user).createRaw(
            repository.projectId.toString(),
            {
                name: "MFE_ORCHESTRATOR_DEPLOY_SECRET - GitLab - " + repository.name,
                role: ApiKeyRole.MANAGER,
                expiresAt: new Date(Date.now() + 3600 * 1000 * 365)
            },
            session
        )

        await gitlabClient.addGroupSecret({
            groupId: repository.gitlabData.groupId,
            secretName: deploySecretName,
            secretValue: apiKey.apiKey
        })
    }

    async injectSecretsToDeployOnGithubRaw(repository: ICodeRepository, session?: ClientSession) {
        if (repository.provider !== CodeRepositoryProvider.GITHUB) return
        if (!repository.githubData?.organizationId) return

        const githubClient = new GithubClient()

        const exists = await githubClient.checkOrganizationSecretExists({
            accessToken: repository.accessToken,
            orgName: repository.githubData.organizationId,
            secretName: deploySecretName
        })

        if (exists) return

        const apiKey = await new ApiKeyService(this.user).createRaw(
            repository.projectId.toString(),
            {
                name: "MFE_ORCHESTRATOR_DEPLOY_SECRET - Github - " + repository.name,
                role: ApiKeyRole.MANAGER,
                expiresAt: new Date(Date.now() + 3600 * 1000 * 365)
            },
            session
        )

        await githubClient.upsertOrganizationSecret({
            accessToken: repository.accessToken,
            orgName: repository.githubData.organizationId,
            secretName: deploySecretName,
            visibility: "all",
            value: apiKey.apiKey
        })
    }

    async injectSecretsToDeployOnAzureDevOpsRaw(repository: ICodeRepository, session?: ClientSession) {
        if (repository.provider !== CodeRepositoryProvider.AZURE_DEV_OPS) return
        if (!repository.azureData?.organization || !repository.azureData?.projectId) return

        const azureDevOpsClient = new AzureDevOpsClient()

        const exists = await azureDevOpsClient.checkOrganizationSecretExists({
            accessToken: repository.accessToken,
            organization: repository.azureData.organization,
            projectId: repository.azureData.projectId,
            variableGroupName: azureDevOpsVariableGroupName,
            secretName: deploySecretName
        })

        if (exists) return

        const apiKey = await new ApiKeyService(this.user).createRaw(
            repository.projectId.toString(),
            {
                name: "MFE_ORCHESTRATOR_DEPLOY_SECRET - Azure DevOps - " + repository.name,
                role: ApiKeyRole.MANAGER,
                expiresAt: new Date(Date.now() + 3600 * 1000 * 365)
            },
            session
        )

        await azureDevOpsClient.upsertOrganizationSecret({
            accessToken: repository.accessToken,
            organization: repository.azureData.organization,
            projectId: repository.azureData.projectId,
            projectName: repository.azureData.projectName,
            secretName: deploySecretName,
            value: apiKey.apiKey,
            variableGroupName: azureDevOpsVariableGroupName,
            variableGroupDescription: "MFE Orchestrator Deploy Secret"
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
        } catch (error: unknown) {
            if (error && typeof error === "object" && "code" in error && error.code === 11000) {
                throw createBusinessException({
                    code: "DUPLICATE_REPOSITORY",
                    message: "A repository with this provider and name already exists",
                    statusCode: 409
                })
            }

            const errorMessage = error instanceof Error ? error.message : String(error)
            throw createBusinessException({
                code: "REPOSITORY_CREATION_ERROR",
                message: "Failed to create repository",
                details: { error: errorMessage },
                statusCode: 500
            })
        }
    }

    async update(repositoryId: string, repositoryData: CodeRepositoryUpdateInput): Promise<ICodeRepository | null> {
        await this.findById(repositoryId)

        try {
            const updated = await CodeRepository.findOneAndUpdate({ _id: toObjectId(repositoryId) }, repositoryData, { new: true, runValidators: true })

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
                details: {
                    error: error instanceof Error ? error.message : "Unknown error"
                },
                statusCode: 500
            })
        }
    }

    async updateGithub(repositoryId: string, body: UpdateGithubDTO): Promise<ICodeRepository | null> {
        return runInTransaction(async session => this.updateGithubRaw(repositoryId, body, session))
    }

    async updateGithubRaw(repositoryId: string, body: UpdateGithubDTO, session?: ClientSession): Promise<ICodeRepository | null> {
        const repository = await this.findById(repositoryId, session)

        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }

        if (repository.provider !== CodeRepositoryProvider.GITHUB) {
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

        const repositoryFromDb = await repository.save({ session })

        await this.injectSecretsToDeployOnGithubRaw(repositoryFromDb, session)

        return repositoryFromDb
    }

    async delete(repositoryId: string): Promise<DeleteResult> {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }

        return await CodeRepository.deleteOne({ _id: toObjectId(repositoryId) })
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

        if (codeRepositoryId) {
            return await this.update(codeRepositoryId, {
                accessToken: responseGithub.access_token
            })
        } else {
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
        return runInTransaction(async session => this.addRepositoryAzureRaw(body, projectId, session))
    }

    async addRepositoryAzureRaw(body: CreateAzureDevOpsRepositoryDTO, projectId: string, session?: ClientSession) {
        await this.ensureAccessToProject(projectId)

        const repository = new CodeRepository({
            name: body.name,
            provider: CodeRepositoryProvider.AZURE_DEV_OPS,
            accessToken: body.pat,
            projectId: new Types.ObjectId(projectId),
            azureData: {
                organization: body.organization,
                projectId: body.projectId,
                projectName: body.projectName
            },
            githubData: undefined,
            gitlabData: undefined,
            isActive: true
        })

        const out = await repository.save({ session })
        await this.injectSecretsToDeployOnAzureDevOpsRaw(out, session)
        return out
    }

    async editRepositoryAzureDevOps(body: CreateAzureDevOpsRepositoryDTO, repositoryId: string) {
        return runInTransaction(async session => this.editRepositoryAzureDevOpsRaw(body, repositoryId, session))
    }

    async editRepositoryAzureDevOpsRaw(body: CreateAzureDevOpsRepositoryDTO, repositoryId: string, session?: ClientSession) {
        const repository = await this.findById(repositoryId, session)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.AZURE_DEV_OPS) {
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
            projectId: body.projectId,
            projectName: body.projectName
        }
        const out = await repository.save({ session })
        await this.injectSecretsToDeployOnAzureDevOpsRaw(out, session)
        return out
    }

    async testConnectionAzure(organization: string, pat: string) {
        return new AzureDevOpsClient().getProjects(pat, organization)
    }

    async addRepositoryGitlab(body: CreateGitlabRepositoryDto, projectId: string) {
        return runInTransaction(async session => this.addRepositoryGitlabRaw(body, projectId, session))
    }

    async addRepositoryGitlabRaw(body: CreateGitlabRepositoryDto, projectId: string, session?: ClientSession) {
        await this.ensureAccessToProject(projectId)

        const repository = new CodeRepository({
            name: body.name,
            provider: CodeRepositoryProvider.GITLAB,
            accessToken: body.pat,
            projectId: new Types.ObjectId(projectId),
            isActive: true,
            gitlabData: {
                url: body.url,
                groupId: body.groupId,
                groupPath: body.groupPath
            },
            githubData: undefined,
            azureData: undefined
        })

        const out = await repository.save({ session })
        await this.injectSecretsToDeployOnGitlabRaw(out, session)
        return out
    }

    async editRepositoryGitlab(body: CreateGitlabRepositoryDto, repositoryId: string) {
        return runInTransaction(async session => this.editRepositoryGitlabRaw(body, repositoryId, session))
    }

    async editRepositoryGitlabRaw(body: CreateGitlabRepositoryDto, repositoryId: string, session?: ClientSession) {
        const repository = await this.findById(repositoryId, session)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.GITLAB) {
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
            groupId: body.groupId,
            groupPath: body.groupPath
        }
        repository.githubData = undefined
        repository.azureData = undefined
        const out = await repository.save({ session })
        await this.injectSecretsToDeployOnGitlabRaw(out, session)
        return out
    }

    async testConnectionGitlab(url: string, pat: string) {
        return new GitLabClient(url, pat).getGroups()
    }

    async getAzureRepositories(repositoryId: string, projectId: string): Promise<RepositoryData[]> {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.AZURE_DEV_OPS) {
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not Azure DevOps",
                statusCode: 400
            })
        }
        return (await new AzureDevOpsClient().getRepositories(repository.accessToken, repository?.name, projectId))?.value
    }

    async getAzureProjects(repositoryId: string): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.AZURE_DEV_OPS) {
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not Azure DevOps",
                statusCode: 400
            })
        }
        return new AzureDevOpsClient().getProjects(repository.accessToken, repository?.name)
    }

    async getGithubOrganizations(repositoryId: string): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.GITHUB) {
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
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.GITHUB) {
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitHub",
                statusCode: 400
            })
        }
        return new GithubClient().getUser(repository.accessToken)
    }

    async getGitlabGroups(codeRepositoryId: string, selectOnlyChilds: boolean = true): Promise<unknown> {
        const repository = await this.findById(codeRepositoryId)
        if (!repository) {
            throw new EntityNotFoundError(codeRepositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.GITLAB || !repository.gitlabData?.url) {
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        const groups = await new GitLabClient(repository.gitlabData?.url, repository.accessToken).getGroups()
        if (selectOnlyChilds && repository.gitlabData?.groupPath) {
            const startsWith = repository.gitlabData?.groupPath
            return groups.filter(group => group.full_path.startsWith(startsWith))
        }
        return groups
    }

    async getGitlabPaths(repositoryId: string, groupId: number): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.GITLAB || !repository.gitlabData?.url || !repository.gitlabData?.groupPath) {
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.gitlabData?.url, repository.accessToken).getRepositoryPathsByGroupId(repository.gitlabData?.groupPath)
    }

    async getGitlabRepositories(repositoryId: string, groupId: number): Promise<unknown> {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider !== CodeRepositoryProvider.GITLAB || !repository.gitlabData?.url) {
            throw new BusinessException({
                code: "INVALID_PROVIDER",
                message: "Repository provider is not GitLab",
                statusCode: 400
            })
        }
        return new GitLabClient(repository.gitlabData?.url, repository.accessToken).getRepositoriesByGroupId(groupId)
    }

    async getRepositories(repositoryId: string, groupPath?: string, groupId?: number) {
        const repository = await this.findById(repositoryId)
        if (!repository) {
            throw new EntityNotFoundError(repositoryId)
        }
        if (repository.provider === CodeRepositoryProvider.GITHUB) {
            if (!repository.githubData?.type) {
                throw new BusinessException({
                    code: "INVALID_PROVIDER",
                    message: "Repository provider is not GitHub",
                    statusCode: 400
                })
            }
            return new GithubClient().getRepositories(repository.accessToken, repository.githubData?.type === CodeRepositoryType.ORGANIZATION ? repository.githubData.organizationId : undefined)
        }
        if (repository.provider === CodeRepositoryProvider.GITLAB) {
            if (!repository.gitlabData?.groupPath) {
                throw new BusinessException({
                    code: "INVALID_PROVIDER",
                    message: "Repository provider is not GitLab",
                    statusCode: 400
                })
            }
            return new GitLabClient(repository.gitlabData?.url, repository.accessToken).getRepositoriesByGroupId(groupId || repository.gitlabData?.groupId)
        }
        if (repository.provider === CodeRepositoryProvider.AZURE_DEV_OPS) {
            if (!repository.azureData?.organization || !repository.azureData?.projectId) {
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
