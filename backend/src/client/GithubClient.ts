import axios from "axios"
import sodium from "libsodium-wrappers"
import { CodeRepositoryType } from "../models/CodeRepositoryModel"

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
    visibility?: "public" | "private" | "internal"
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
    type?: CodeRepositoryType
    owner: string
    repositoryName: string
    ref?: string
    inputs?: Record<string, unknown>
    workflowId?: string
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

export interface GithubPublicKey {
    key_id: string
    key: string
}

export interface GithubSecret {
    name: string
    created_at: string
    updated_at: string
}

export interface GithubSecretsListResponse {
    total_count: number
    secrets: GithubSecret[]
}

export interface GithubBaseDTO {
    accessToken: string
    orgName?: string
    userName?: string
}

export interface GithubRepositoryBaseDTO extends GithubBaseDTO {
    repositoryName: string
}

export interface GithubUpsertSecretDTO extends GithubRepositoryBaseDTO {
    secretName: string
    value: string
}

export interface GithubOrganizationSecretDTO extends GithubBaseDTO {
    secretName: string
    value: string
    visibility?: "all" | "private" | "selected"
    selectedRepositoryIds?: number[]
}

class GithubClient {
    async encryptValueForSecret(key: string, secret: string): Promise<string> {
        await sodium.ready

        // Convert the secret and key to a Uint8Array.
        const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL)
        const binsec = sodium.from_string(secret)

        // Encrypt the secret using libsodium
        const encBytes = sodium.crypto_box_seal(binsec, binkey)

        // Convert the encrypted Uint8Array to Base64
        const output = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL)

        // Print the output
        return output
    }

    async getAccessToken(data: GithubAccessTokenRquest): Promise<GithubAccessTokenResponse> {
        const responseGithub = await axios.request<GithubAccessTokenResponse>({
            method: "POST",
            url: "https://github.com/login/oauth/access_token",
            headers: {
                Accept: "application/json"
            },
            data
        })

        if (responseGithub.data.error) {
            throw new Error(responseGithub.data.error_description)
        }

        return responseGithub.data
    }

    async getUser(accessToken: string): Promise<GithubUser> {
        const response = await axios.request<GithubUser>({
            url: "https://api.github.com/user",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            }
        })

        return response.data
    }

    private getRepositoryBaseUrl(repositoryName: string, orgName?: string, userName?: string) {
        return orgName ? `https://api.github.com/orgs/${orgName}/repos/${repositoryName}` : `https://api.github.com/repos/${userName}/${repositoryName}`
    }

    async getRepositoryPublicKey({ accessToken, orgName, userName, repositoryName }: GithubRepositoryBaseDTO): Promise<GithubPublicKey> {
        const url = `${this.getRepositoryBaseUrl(repositoryName, orgName, userName)}/actions/secrets/public-key`

        const response = await axios.request<GithubPublicKey>({
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            }
        })

        return response.data
    }

    async getOrganizationPublicKey({ accessToken, orgName }: GithubBaseDTO): Promise<GithubPublicKey> {
        if (!orgName) {
            throw new Error("Organization name is required")
        }

        const url = `https://api.github.com/orgs/${orgName}/actions/secrets/public-key`

        const response = await axios.request<GithubPublicKey>({
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            }
        })

        return response.data
    }

    async upsertRepositorySecret({ accessToken, orgName, userName, repositoryName, secretName, value }: GithubUpsertSecretDTO): Promise<void> {
        const { key, key_id } = await this.getRepositoryPublicKey({
            accessToken,
            orgName,
            userName,
            repositoryName
        })

        const url = `${this.getRepositoryBaseUrl(repositoryName, orgName, userName)}/actions/secrets/${encodeURIComponent(secretName)}`

        await axios.request<void>({
            method: "PUT",
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            },
            data: {
                encrypted_value: await this.encryptValueForSecret(key, value),
                key_id
            }
        })
    }

    async checkRepositorySecretExists({ accessToken, orgName, userName, repositoryName, secretName }: Omit<GithubUpsertSecretDTO, "value">): Promise<boolean> {
        try {
            const url = `${this.getRepositoryBaseUrl(repositoryName, orgName, userName)}/actions/secrets/${encodeURIComponent(secretName)}`

            await axios.request({
                method: "GET",
                url,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                    "User-Agent": "MFE-Orchestrator"
                }
            })

            return true
        } catch (error: unknown) {
            if (error && typeof error === "object" && "response" in error) {
                const err = error as { response?: { status?: number } }
                if (err.response?.status === 404) {
                    return false
                }
            }
            throw error
        }
    }

    async upsertOrganizationSecret({ accessToken, orgName, secretName, value, visibility = "private", selectedRepositoryIds }: GithubOrganizationSecretDTO): Promise<void> {
        if (!orgName) {
            throw new Error("Organization name is required")
        }

        const { key_id, key } = await this.getOrganizationPublicKey({
            accessToken,
            orgName
        })

        const url = `https://api.github.com/orgs/${orgName}/actions/secrets/${encodeURIComponent(secretName)}`

        const data: {
            encrypted_value: string
            key_id: string
            visibility: string
            selected_repository_ids?: number[]
        } = {
            encrypted_value: await this.encryptValueForSecret(key, value),
            key_id: key_id,
            visibility
        }

        // Se la visibilità è 'selected', aggiungi gli ID dei repository selezionati
        if (visibility === "selected" && selectedRepositoryIds && selectedRepositoryIds.length > 0) {
            data.selected_repository_ids = selectedRepositoryIds
        }

        await axios.request<void>({
            method: "PUT",
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            },
            data
        })
    }

    async checkOrganizationSecretExists({ accessToken, orgName, secretName }: Omit<GithubOrganizationSecretDTO, "value" | "visibility" | "selectedRepositoryIds">): Promise<boolean> {
        if (!orgName) {
            throw new Error("Organization name is required")
        }

        try {
            const url = `https://api.github.com/orgs/${orgName}/actions/secrets/${encodeURIComponent(secretName)}`

            await axios.request({
                method: "GET",
                url,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                    "User-Agent": "MFE-Orchestrator"
                }
            })

            return true
        } catch (error: unknown) {
            if (error && typeof error === "object" && "response" in error) {
                const err = error as { response?: { status?: number } }
                if (err.response?.status === 404) {
                    return false
                }
            }
            throw error
        }
    }

    async getOrganization(orgName: string, accessToken: string): Promise<GithubOrganization> {
        const response = await axios.request<GithubOrganization>({
            url: `https://api.github.com/orgs/${orgName}`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            }
        })

        return response.data
    }

    async getUserOrganizations(accessToken: string): Promise<GithubOrganization[]> {
        const response = await axios.request<GithubOrganization[]>({
            url: "https://api.github.com/user/orgs",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            }
        })

        return response.data
    }

    async createRepository(repositoryData: CreateRepositoryRequest, accessToken: string, orgName?: string): Promise<GithubRepository> {
        const url = orgName ? `https://api.github.com/orgs/${orgName}/repos` : "https://api.github.com/user/repos"

        const response = await axios.request<GithubRepository>({
            method: "POST",
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            },
            data: repositoryData
        })

        return response.data
    }

    async getBranches(accessToken: string, repositoryName: string, orgName?: string, userName?: string): Promise<GithubBranch[]> {
        const response = await axios.request<GithubBranch[]>({
            url: `https://api.github.com/repos/${orgName || userName}/${repositoryName}/branches`,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            }
        })

        return response.data
    }

    async getRepositories(accessToken: string, orgName?: string): Promise<GithubRepository[]> {
        const url = orgName ? `https://api.github.com/orgs/${orgName}/repos` : "https://api.github.com/user/repos"

        const response = await axios.request<GithubRepository[]>({
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            }
        })

        return response.data
    }

    async createBuild(buildData: CreateBuildRequest, accessToken: string): Promise<GithubWorkflowDispatchResponse> {
        const { workflowId = "build-and-deploy.yml" } = buildData

        const response = await axios.request<GithubWorkflowDispatchResponse>({
            url: `https://api.github.com/repos/${buildData.owner}/${buildData.repositoryName}/actions/workflows/${workflowId}/dispatches`,
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "MFE-Orchestrator"
            },
            data: {
                ref: buildData.ref || "main",
                inputs: {
                    version: buildData.version || "${{github.ref_name}}",
                    ...buildData.inputs
                }
            }
        })

        return response.data || {}
    }
}

export default GithubClient
