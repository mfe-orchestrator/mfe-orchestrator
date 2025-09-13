import axios from "axios"


export interface GithubAccessTokenResponse {
    access_token: string
    scope: string
    token_type: string
    error?: string
    error_description?: string
    error_uri?: string
}

export interface GithubAccessTokenRquest {
    client_id: string
    client_secret: string
    code: string
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

export interface CreateRepositoryRequest {
    name: string
    description?: string
    homepage?: string
    private?: boolean
    has_issues?: boolean
    has_projects?: boolean
    has_wiki?: boolean
    is_template?: boolean
    team_id?: number
    auto_init?: boolean
    gitignore_template?: string
    license_template?: string
    allow_squash_merge?: boolean
    allow_merge_commit?: boolean
    allow_rebase_merge?: boolean
    allow_auto_merge?: boolean
    delete_branch_on_merge?: boolean
    has_downloads?: boolean
    visibility?: 'public' | 'private' | 'internal'
}

export interface GithubRepository {
    id: number
    node_id: string
    name: string
    full_name: string
    owner: {
        login: string
        id: number
        avatar_url: string
        type: string
    }
    private: boolean
    html_url: string
    description: string | null
    fork: boolean
    url: string
    clone_url: string
    ssh_url: string
    svn_url: string
    homepage: string | null
    size: number
    stargazers_count: number
    watchers_count: number
    language: string | null
    has_issues: boolean
    has_projects: boolean
    has_wiki: boolean
    has_pages: boolean
    forks_count: number
    archived: boolean
    disabled: boolean
    open_issues_count: number
    license: {
        key: string
        name: string
        spdx_id: string
        url: string
    } | null
    allow_forking: boolean
    is_template: boolean
    topics: string[]
    visibility: string
    forks: number
    open_issues: number
    watchers: number
    default_branch: string
    created_at: string
    updated_at: string
}

export interface CreateBuildRequest {
    version?: string
    owner: string
    repo: string
    ref?: string
    inputs?: Record<string, any>
}

export interface GithubWorkflowDispatchResponse {
    message?: string
}

export interface GithubBranch {
    name: string
    commit: {
        sha: string
        url: string
    }
}

class GithubClient {

    getAccessToken = async (data: GithubAccessTokenRquest): Promise<GithubAccessTokenResponse> => {
        const responseGithub = await axios.request<GithubAccessTokenResponse>({
            method: 'POST',
            url: 'https://github.com/login/oauth/access_token',
            headers: {
                Accept: 'application/json'
            },
            data
        })

        if(responseGithub.data.error){
            throw new Error(responseGithub.data.error_description)
        }

        return responseGithub.data
    }

    getUser = async (accessToken: string): Promise<GithubUser> => {
        const response = await axios.request<GithubUser>({
            url: 'https://api.github.com/user',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MFE-Orchestrator-Hub'
            }
        })

        return response.data
    }

    getOrganization = async (orgName: string, accessToken: string): Promise<GithubOrganization> => {
        const response = await axios.request<GithubOrganization>({
            url: `https://api.github.com/orgs/${orgName}`,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MFE-Orchestrator-Hub'
            }
        })

        return response.data
    }

    getUserOrganizations = async (accessToken: string): Promise<GithubOrganization[]> => {
        const response = await axios.request<GithubOrganization[]>({
            url: 'https://api.github.com/user/orgs',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MFE-Orchestrator-Hub'
            }
        })

        return response.data
    }

    createRepository = async (repositoryData: CreateRepositoryRequest, accessToken: string, orgName?: string): Promise<GithubRepository> => {
        const url = orgName 
            ? `https://api.github.com/orgs/${orgName}/repos`
            : 'https://api.github.com/user/repos'

        const response = await axios.request<GithubRepository>({
            method: 'POST',
            url,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MFE-Orchestrator-Hub'
            },
            data: repositoryData
        })

        return response.data
    }

    getBranches = async (accessToken: string, repositoryId: string, orgName?: string): Promise<GithubBranch[]> => {
        const url = orgName 
            ? `https://api.github.com/orgs/${orgName}/repos/${repositoryId}/branches`
            : `https://api.github.com/user/repos/${repositoryId}/branches`

        const response = await axios.request<GithubBranch[]>({
            url,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MFE-Orchestrator-Hub'
            }
        })

        return response.data
    }

    getRepositories = async (accessToken: string, orgName?: string): Promise<GithubRepository[]> => {
        const url = orgName 
            ? `https://api.github.com/orgs/${orgName}/repos`
            : 'https://api.github.com/user/repos'

        const response = await axios.request<GithubRepository[]>({
            url,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MFE-Orchestrator-Hub'
            }
        })

        return response.data
    }

    createBuild = async (buildData: CreateBuildRequest, accessToken: string): Promise<GithubWorkflowDispatchResponse> => {
        const workflowId = 'build-and-deploy-remotes.yml'

        const url = `https://api.github.com/repos/${buildData.owner}/${buildData.repo}/actions/workflows/${workflowId}/dispatches`

        const response = await axios.request<GithubWorkflowDispatchResponse>({
            method: 'POST',
            url,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'MFE-Orchestrator-Hub'
            },
            data: {
                ref: buildData.ref || 'main',
                inputs: {
                    version: buildData.version || '${{github.ref_name}}',
                    ...buildData.inputs
                }
            }
        })

        return response.data || {}
    }
}

export default GithubClient
