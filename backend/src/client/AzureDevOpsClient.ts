import axios from "axios"

export interface AzureAccessTokenResponse {
    access_token: string
    token_type: string
    expires_in: number
    refresh_token: string
    scope: string
    error?: string
    error_description?: string
}

export interface AzureAccessTokenRequest {
    client_id: string
    client_secret: string
    code: string
    redirect_uri: string
    grant_type: string
}

export interface AzureUser {
    subjectId: string
    descriptor: string
    publicAlias: string
    emailAddress: string
    coreRevision: number
    timeStamp: string
    id: string
    revision: number
    url: string
    displayName: string
    uniqueName: string
    imageUrl: string
    isAadIdentity: boolean
    isContainer: boolean
    isDeletedInOrigin: boolean
    profileUrl: string
    directoryAlias: string
    domain: string
    principalName: string
    mailAddress: string
}

export interface AzureOrganization {
    accountId: string
    accountName: string
    accountUri: string
    properties: Record<string, unknown>
}

export interface AzureDevOpsProject {
    id: string
    name: string
    url: string
    state: string
    revision: number
    visibility: string
    lastUpdateTime: string
    description?: string // opzionale perché non tutte le voci hanno description
}

export interface AzureDevOpsProjectsResponse {
    count: number
    value: AzureDevOpsProject[]
}

export interface RepositoryData {
    id: string
    name: string
    url: string
    project: {
        id: string
        name: string
        url: string
    }
    defaultBranch: string
    size: number
    remoteUrl: string
    sshUrl: string
    webUrl: string
    isDisabled: boolean
    isInMaintenance: boolean
}

export interface GetRepositoryDTO {
    count: number
    value: RepositoryData[]
}

export interface AzureDevOpsBranch {
    name: string
    objectId: string
    creator: {
        displayName: string
        uniqueName: string
        _links: {
            avatar: { href: string }
        }
    }
    url: string
}

export interface AzureDevOpsBranchDTO {
    count: number
    value: AzureDevOpsBranch[]
}

export interface AzureDevOpsPipeline {
    id: number
    name: string
    folder: string
    revision: number
    _links: {
        self: { href: string }
        web: { href: string }
    }
    url: string
}

export interface CreatePipelineRequest {
    name: string
    folder?: string
    configuration: {
        type: "yaml"
        path: string
        repository: {
            id: string
            type: "azureReposGit"
        }
    }
}

export interface AzureVariableGroup {
    id: number
    name: string
    description?: string
    type: string
    variables: Record<string, { value: string; isSecret?: boolean }>
}

export interface AzureVariableGroupsResponse {
    count: number
    value: AzureVariableGroup[]
}

export interface CheckOrganizationSecretExistsParams {
    accessToken: string
    organization: string
    projectId: string
    secretName: string
    variableGroupName: string
}

export interface UpsertOrganizationSecretParams {
    accessToken: string
    organization: string
    projectId: string
    projectName: string
    secretName: string
    value: string
    variableGroupName: string
    variableGroupDescription: string
}

class AzureDevOpsClient {
    // Ottieni l'ID utente dal profilo
    async getUserId(token: string) {
        const response = await axios.request({
            url: "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1-preview.3",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })
        return response.data.id // userId
    }

    // Ottieni tutte le orgs dell'utente
    async getOrganizations(token: string) {
        const userId = await this.getUserId(token)
        const url = `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${userId}&api-version=7.1-preview.1`

        const response = await axios.request({
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })
        return response.data.value // array di orgs
    }

    async getProjects(token: string, organization: string): Promise<AzureDevOpsProjectsResponse> {
        const url = `https://dev.azure.com/${organization}/_apis/projects?api-version=7.1-preview.4`
        const response = await axios.request<AzureDevOpsProjectsResponse>({
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })
        return response.data
    }

    async getRepositories(token: string, organization: string, project: string): Promise<GetRepositoryDTO> {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories?api-version=7.1-preview.1`
        const response = await axios.request({
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })
        return response.data
    }

    async createRepository(token: string, organization: string, project: string, repositoryName: string) {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories?api-version=7.1-preview.1`
        const body = {
            name: repositoryName,
            project: {
                id: project
            }
        }

        const response = await axios.request({
            method: "POST",
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            data: body
        })

        return response.data
    }

    async getRepository(token: string, organization: string, project: string, repositoryName: string) {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryName}?api-version=7.1-preview.1`
        const response = await axios.request({
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })

        return response.data
    }

    async getBranches(token: string, organization: string, project: string, repositoryName: string): Promise<AzureDevOpsBranchDTO> {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryName}/refs?filter=heads/&api-version=7.1-preview.1`
        const response = await axios.request<AzureDevOpsBranchDTO>({
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })
        return response.data
    }

    async createPipeline(
        token: string,
        organization: string,
        project: string,
        repositoryId: string,
        pipelineName: string,
        yamlPath: string = "azure-pipelines.yml",
        folder: string = "/"
    ): Promise<AzureDevOpsPipeline> {
        const url = `https://dev.azure.com/${organization}/${project}/_apis/pipelines?api-version=7.1-preview.1`

        const body: CreatePipelineRequest = {
            name: pipelineName,
            folder: folder,
            configuration: {
                type: "yaml",
                path: yamlPath,
                repository: {
                    id: repositoryId,
                    type: "azureReposGit"
                }
            }
        }

        const response = await axios.request<AzureDevOpsPipeline>({
            method: "POST",
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            data: body
        })

        return response.data
    }

    /**
     * Get all variable groups for a project
     */
    private async getVariableGroups(token: string, organization: string, projectId: string): Promise<AzureVariableGroupsResponse> {
        const url = `https://dev.azure.com/${organization}/${projectId}/_apis/distributedtask/variablegroups?api-version=7.1-preview.2`
        const response = await axios.request<AzureVariableGroupsResponse>({
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        })
        return response.data
    }

    /**
     * Check if a secret exists in the organization's variable group
     */
    async checkOrganizationSecretExists({ accessToken, organization, projectId, secretName, variableGroupName }: CheckOrganizationSecretExistsParams): Promise<boolean> {
        try {
            const variableGroup = await this.getVariableGroups(accessToken, organization, projectId)
            const existingGroup = variableGroup.value.find(g => g.name === variableGroupName)

            if (existingGroup) {
                return secretName in existingGroup.variables
            }

            return false
        } catch (error) {
            console.error("Error checking Azure DevOps secret:", error)
            return false
        }
    }

    /**
     * Create or update a secret in the organization's variable group
     */
    async upsertOrganizationSecret({
        accessToken,
        organization,
        projectId,
        projectName,
        secretName,
        value,
        variableGroupName,
        variableGroupDescription
    }: UpsertOrganizationSecretParams): Promise<void> {
        // Get or create the variable group
        const groups = await this.getVariableGroups(accessToken, organization, projectId)
        const variableGroup = groups.value.find(g => g.name === variableGroupName)

        if (!variableGroup) {
            // Create new variable group with the secret
            await axios.request<AzureVariableGroup>({
                method: "POST",
                url: `https://dev.azure.com/${organization}/${projectId}/_apis/distributedtask/variablegroups?api-version=7.1`,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                },
                data: {
                    name: variableGroupName,
                    description: variableGroupDescription,
                    type: "Vsts",
                    variables: {
                        [secretName]: {
                            value,
                            isSecret: true
                        }
                    },
                    variableGroupProjectReferences: [
                        {
                            name: variableGroupName,
                            projectReference: {
                                id: projectId,
                                name: projectName
                            }
                        }
                    ]
                }
            })
            return
        }

        // Update the existing variable group with the new secret
        await axios.request({
            method: "PUT",
            url: `https://dev.azure.com/${organization}/${projectId}/_apis/distributedtask/variablegroups/${variableGroup.id}?api-version=7.1-preview.2`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            data: {
                ...variableGroup,
                variables: {
                    ...variableGroup.variables,
                    [secretName]: {
                        value: value,
                        isSecret: true
                    }
                },
                variableGroupProjectReferences: [
                    {
                        name: variableGroupName,
                        projectReference: {
                            id: projectId,
                            name: projectName
                        }
                    }
                ]
            }
        })
    }
}

export default AzureDevOpsClient
