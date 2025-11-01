import useApiClient, { IClientRequestDataExtended, IClientRequestMetadataExtended } from "../useApiClient"

export interface AddRepositoryGithubDTO {
    code: string
    state: string
    codeRepositoryId: string
}

export interface AddRepositoryAzureDTO {
    pat: string
    organization: string
    name: string
    project: string
}

export interface TestConnectionAzureRepositoryAzureDTO {
    pat: string
    organization: string
}

export interface AddRepositoryGitlabDTO {
    name: string
    pat: string
    url: string
}

export enum CodeRepositoryProvider {
    GITHUB = "GITHUB",
    GITLAB = "GITLAB",
    AZURE_DEV_OPS = "AZURE_DEV_OPS"
}

export interface GithubUser {
    login: string
    id: number
    node_id: string
    avatar_url: string
    gravatar_id: string
    url: string
    html_url: string
    followers_url: string
    following_url: string
    gists_url: string
    starred_url: string
    subscriptions_url: string
    organizations_url: string
    repos_url: string
    events_url: string
    received_events_url: string
    type: string
    site_admin: boolean
    name: string
    company: string | null
    blog: string
    location: string | null
    email: string | null
    hireable: boolean | null
    bio: string | null
    twitter_username: string | null
    public_repos: number
    public_gists: number
    followers: number
    following: number
    created_at: string
    updated_at: string
}

export interface GithubOrganization {
    login: string
    id: number
    node_id: string
    url: string
    repos_url: string
    events_url: string
    hooks_url: string
    issues_url: string
    members_url: string
    public_members_url: string
    avatar_url: string
    description: string | null
    gravatar_id: string
    name: string | null
    company: string | null
    blog: string
    location: string | null
    email: string | null
    twitter_username: string | null
    is_verified: boolean
    has_organization_projects: boolean
    has_repository_projects: boolean
    public_repos: number
    public_gists: number
    followers: number
    following: number
    html_url: string
    created_at: string
    updated_at: string
    type: string
}

export enum CodeRepositoryType {
    PERSONAL = "PERSONAL",
    ORGANIZATION = "ORGANIZATION"
}

export interface ICodeRepository {
    _id: string
    name: string
    default: boolean
    provider: CodeRepositoryProvider
    accessToken: string
    refreshToken?: string
    githubData?: {
        organizationId: string
        type: CodeRepositoryType
    }
    isActive: boolean
    projectId: string
    createdAt: Date
    updatedAt: Date
}

export interface IUpdateCodeRepositoryGithubData {
    name: string
    organizationId: string
    userName: string
    type: CodeRepositoryType
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

export interface GitlabProject {
    id: number
    name: string
    path: string
    path_with_namespace: string
    description?: string
    visibility: string
    web_url: string
    created_at: string
    last_activity_at: string
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

export interface Repository {
    id?: string | number
    name: string
    _id: string
    provider: string
    [key: string]: unknown
}

interface IGetRepositories extends IClientRequestMetadataExtended {
    repositoryId: string
}

const useCodeRepositoriesApi = () => {
    const apiClient = useApiClient()

    const getRepositoriesByProjectId = async (projectId: string): Promise<ICodeRepository[]> => {
        const data = await apiClient.doRequest<ICodeRepository[]>({
            url: `/api/projects/${projectId}/repositories`
        })
        return data.data
    }

    const getRepositoryById = async (repositoryId: string, config: IClientRequestDataExtended<unknown> = {}): Promise<ICodeRepository> => {
        const data = await apiClient.doRequest<ICodeRepository>({
            url: `/api/repositories/${repositoryId}`,
            ...config
        })
        return data.data
    }

    const getRepositories = async ({ repositoryId, ...config }: IGetRepositories): Promise<Repository[]> => {
        const data = await apiClient.doRequest<Repository[]>({
            url: `/api/repositories/${repositoryId}/repositories`,
            ...config
        })
        return data.data
    }

    const updateRepository = async (repositoryId: string, data: ICodeRepository): Promise<ICodeRepository> => {
        const response = await apiClient.doRequest<ICodeRepository>({
            url: `/api/repositories/${repositoryId}`,
            method: "PUT",
            data
        })
        return response.data
    }

    const updateRepositoryGithub = async (repositoryId: string, data: IUpdateCodeRepositoryGithubData): Promise<ICodeRepository> => {
        const response = await apiClient.doRequest<ICodeRepository>({
            url: `/api/repositories/${repositoryId}/github`,
            method: "PUT",
            data
        })
        return response.data
    }

    const setRepositoryAsDefault = async (repositoryId: string): Promise<ICodeRepository> => {
        const response = await apiClient.doRequest<ICodeRepository>({
            url: `/api/repositories/${repositoryId}/default`,
            method: "PUT"
        })
        return response.data
    }

    const addRepositoryGithub = async (data: AddRepositoryGithubDTO): Promise<ICodeRepository> => {
        const request = await apiClient.doRequest<ICodeRepository>({
            url: `/api/repositories/callback/github`,
            method: "POST",
            data
        })
        return request.data
    }

    const addRepositoryAzure = async (data: AddRepositoryAzureDTO) => {
        await apiClient.doRequest({
            url: `/api/repositories/azure`,
            method: "POST",
            data
        })
    }

    const editRepositoryAzure = async (repositoryId: string, data: AddRepositoryAzureDTO) => {
        await apiClient.doRequest({
            url: `/api/repositories/${repositoryId}/azure`,
            method: "PUT",
            data
        })
    }

    const testConnectionAzure = async (data: TestConnectionAzureRepositoryAzureDTO): Promise<AzureDevOpsProjectsResponse> => {
        const response = await apiClient.doRequest<AzureDevOpsProjectsResponse>({
            url: `/api/repositories/azure/test`,
            method: "POST",
            data
        })
        return response.data
    }

    const addRepositoryGitlab = async (data: AddRepositoryGitlabDTO) => {
        await apiClient.doRequest({
            url: `/api/repositories/gitlab`,
            method: "POST",
            data
        })
    }

    const editRepositoryGitlab = async (repositoryId: string, data: AddRepositoryGitlabDTO) => {
        await apiClient.doRequest({
            url: `/api/repositories/${repositoryId}/gitlab`,
            method: "PUT",
            data
        })
    }

    const testConnectionGitlab = async (data: AddRepositoryGitlabDTO): Promise<GitlabProject[]> => {
        const response = await apiClient.doRequest<GitlabProject[]>({
            url: `/api/repositories/gitlab/test`,
            method: "POST",
            data
        })
        return response.data
    }

    const deleteSingle = async (repositoryId: string) => {
        await apiClient.doRequest({
            url: `/api/repositories/${repositoryId}`,
            method: "DELETE"
        })
    }

    const getAzureProjects = async (repositoryId: string): Promise<AzureDevOpsProjectsResponse> => {
        const response = await apiClient.doRequest<AzureDevOpsProjectsResponse>({
            url: `/api/repositories/${repositoryId}/azure/projects`,
            method: "GET"
        })
        return response.data
    }

    const getAzureRepositories = async (repositoryId: string, projectId: string): Promise<unknown[]> => {
        const response = await apiClient.doRequest<unknown[]>({
            url: `/api/repositories/${repositoryId}/azure/projects/${projectId}/repositories`,
            method: "POST"
        })
        return response.data
    }

    const getBranches = async (codeRepositoryId: string, repositoryId: string): Promise<UnifiedBranch[]> => {
        const response = await apiClient.doRequest<UnifiedBranch[]>({
            url: `/api/repositories/${codeRepositoryId}/repositories/${repositoryId}/branches`
        })
        return response.data
    }

    const checkRepositoryNameAvailability = async (repositoryId: string, repositoryName: string): Promise<boolean> => {
        const response = await apiClient.doRequest<boolean>({
            url: `/api/repositories/${repositoryId}/repositories/check-name`,
            method: "GET",
            params: { name: repositoryName }
        })
        return response.data
    }

    const getGithubOrganizations = async (repositoryId: string, config: IClientRequestDataExtended<unknown> = {}): Promise<GithubOrganization[]> => {
        const response = await apiClient.doRequest<GithubOrganization[]>({
            url: `/api/repositories/${repositoryId}/github/organizations`,
            ...config
        })
        return response.data
    }

    const getGithubUser = async (repositoryId: string, config: IClientRequestDataExtended<unknown> = {}): Promise<GithubUser> => {
        const response = await apiClient.doRequest<GithubUser>({
            url: `/api/repositories/${repositoryId}/github/user`,
            ...config
        })
        return response.data
    }

    const getGitlabGroups = async (repositoryId: string): Promise<unknown[]> => {
        const response = await apiClient.doRequest<unknown[]>({
            url: `/api/repositories/${repositoryId}/gitlab/groups`,
            method: "GET"
        })
        return response.data
    }

    const getGitlabGroupRepositories = async (repositoryId: string, groupId: string): Promise<unknown[]> => {
        const response = await apiClient.doRequest<unknown[]>({
            url: `/api/repositories/${repositoryId}/gitlab/groups/${groupId}/repositories`,
            method: "GET"
        })
        return response.data
    }

    const getGitlabGroupPaths = async (repositoryId: string, groupId: string): Promise<unknown[]> => {
        const response = await apiClient.doRequest<unknown[]>({
            url: `/api/repositories/${repositoryId}/gitlab/groups/${groupId}/paths`,
            method: "GET"
        })
        return response.data
    }

    return {
        getRepositoriesByProjectId,
        getRepositoryById,
        addRepositoryGithub,
        addRepositoryAzure,
        addRepositoryGitlab,
        deleteSingle,
        updateRepository,
        testConnectionAzure,
        testConnectionGitlab,
        editRepositoryAzure,
        getAzureProjects,
        getAzureRepositories,
        checkRepositoryNameAvailability,
        getBranches,
        getGithubOrganizations,
        getGithubUser,
        getGitlabGroups,
        getGitlabGroupRepositories,
        getGitlabGroupPaths,
        updateRepositoryGithub,
        setRepositoryAsDefault,
        editRepositoryGitlab,
        getRepositories
    }
}

export default useCodeRepositoriesApi
