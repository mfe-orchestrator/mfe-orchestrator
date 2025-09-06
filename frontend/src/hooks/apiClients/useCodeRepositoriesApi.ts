import useApiClient from "../useApiClient"

export interface AddRepositoryGithubDTO{
    code: string
    state: string
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


export interface ICodeRepository {
    _id: string
    name: string
    provider: CodeRepositoryProvider
    accessToken: string
    refreshToken?: string
    githubData?: {
        user: GithubUser,
        organizations: GithubOrganization[]
    },
    isActive: boolean
    projectId: string
    createdAt: Date
    updatedAt: Date
}

const useCodeRepositoriesApi = () => {

    const apiClient = useApiClient()

    const getRepositoriesByProjectId = async (projectId: string): Promise<ICodeRepository[]> => {
        const data = await apiClient.doRequest<ICodeRepository[]>({
            url: `/api/projects/${projectId}/repositories`,
        });
        return data.data
    }

    const getRepositoryById = async (repositoryId: string) => {
        const data = await apiClient.doRequest({
            url: `/api/repositories/${repositoryId}`,
        });
        return data.data
    }

    const addRepositoryGithub = async (data: AddRepositoryGithubDTO) =>{
        await apiClient.doRequest({
            url: `/api/repositories/callback/github`,
            method: 'POST',
            data
        });
    }


    const deleteSingle = async (repositoryId: string) =>{
        await apiClient.doRequest({
            url: `/api/repositories/${repositoryId}`,
            method: 'DELETE',
        });
    } 

    return {
        getRepositoriesByProjectId,
        getRepositoryById,
        addRepositoryGithub,
        deleteSingle
    }
    
}

export default useCodeRepositoriesApi
