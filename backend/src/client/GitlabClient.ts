import axios, { AxiosInstance } from "axios"

interface GitLabGroup {
    id: number
    name: string
    full_path: string
}

interface GitLabProject {
    id: number
    name: string
    path_with_namespace: string
    description?: string
    default_branch?: string
    web_url?: string
    ssh_url_to_repo?: string
    http_url_to_repo?: string
    visibility?: string
    created_at?: string
    last_activity_at?: string
}

interface CreateRepositoryRequest {
    name: string
    path?: string
    namespace_id?: number
    description?: string
    issues_enabled?: boolean
    merge_requests_enabled?: boolean
    jobs_enabled?: boolean
    wiki_enabled?: boolean
    snippets_enabled?: boolean
    resolve_outdated_diff_discussions?: boolean
    container_registry_enabled?: boolean
    shared_runners_enabled?: boolean
    visibility?: "private" | "internal" | "public"
    public_jobs?: boolean
    only_allow_merge_if_pipeline_succeeds?: boolean
    allow_merge_on_skipped_pipeline?: boolean
    only_allow_merge_if_all_discussions_are_resolved?: boolean
    merge_method?: "merge" | "rebase_merge" | "ff"
    squash_option?: "never" | "always" | "default_on" | "default_off"
    autoclose_referenced_issues?: boolean
    suggestion_commit_message?: string
    initialize_with_readme?: boolean
}

interface CheckGroupSecretExistsRequest {
    groupId: number | string
    secretName: string
}

interface AddGroupSecretRequest {
    groupId: number | string
    secretName: string
    secretValue: string
}

class GitLabClient {
    private api: AxiosInstance

    constructor(url: string, pat: string) {
        this.api = axios.create({
            baseURL: url + "/api/v4",
            headers: {
                "PRIVATE-TOKEN": pat
            }
        })
    }

    async getGroups(owned?: boolean): Promise<GitLabGroup[]> {
        const res = await this.api.get<GitLabGroup[]>("/groups", {
            params: { owned }
        })
        return res.data
    }

    async getRepositoriesByGroupId(groupId: string | number): Promise<GitLabProject[]> {
        const res = await this.api.get<GitLabProject[]>(`/groups/${groupId}/projects`)
        return res.data
    }

    async getRepositoryPathsByGroupId(groupId: string | number): Promise<string[]> {
        const repositories = await this.getRepositoriesByGroupId(groupId)
        const paths = repositories.map(repo => repo.path_with_namespace)

        // Rimuovi eventuali duplicati e filtra valori undefined/null
        return [...new Set(paths.filter(path => path != null))]
    }

    async createRepository(repositoryData: CreateRepositoryRequest): Promise<GitLabProject> {
        const res = await this.api.post<GitLabProject>("/projects", repositoryData)
        return res.data
    }

    async checkGroupSecretExists(request: CheckGroupSecretExistsRequest): Promise<boolean> {
        try {
            await this.api.get(`/groups/${request.groupId}/variables/${request.secretName}`)
            return true
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return false
            }
            throw error
        }
    }

    async addGroupSecret(request: AddGroupSecretRequest): Promise<void> {
        await this.api.post(`/groups/${request.groupId}/variables`, {
            key: request.secretName,
            value: request.secretValue,
            protected: false,
            masked: true,
            hidden: true,
            raw: false
        })
    }
}

export default GitLabClient
