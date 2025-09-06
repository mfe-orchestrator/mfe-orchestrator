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

    
}

export default GithubClient
