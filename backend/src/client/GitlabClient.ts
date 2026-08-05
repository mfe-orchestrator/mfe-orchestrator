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

export interface CommitAction {
    action: "create" | "update" | "delete" | "move"
    file_path: string
    content?: string
    previous_path?: string
}

export interface CommitFilesRequest {
    branch: string
    startBranch?: string
    commitMessage: string
    actions: CommitAction[]
}

export interface GitLabBranch {
    name: string
    commit: {
        id: string
        short_id: string
        title: string
        author_name: string
        author_email: string
        committer_name: string
        committer_email: string
        created_at: string
        message: string
        web_url: string
    }
    merged: boolean
    protected: boolean
    developers_can_push: boolean
    developers_can_merge: boolean
    can_push: boolean
    default: boolean
    web_url: string
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

    async getBranches(projectId: string | number): Promise<GitLabBranch[]> {
        const res = await this.api.get<GitLabBranch[]>(`/projects/${projectId}/repository/branches`)
        return res.data
    }

    async getBranchCommitSha(projectId: string | number, branchName: string): Promise<string> {
        const res = await this.api.get<GitLabBranch>(`/projects/${projectId}/repository/branches/${branchName}`)
        return res.data.commit.id
    }

    async createTag(projectId: string | number, tagName: string, ref: string): Promise<void> {
        await this.api.post(`/projects/${projectId}/repository/tags`, {
            tag_name: tagName,
            ref: ref
        })
    }

    async getProject(projectId: string | number): Promise<GitLabProject> {
        const res = await this.api.get<GitLabProject>(`/projects/${projectId}`)
        return res.data
    }

    /**
     * Reads a text file from a project. Returns null when the file does not exist on the ref.
     */
    async getFileContent(projectId: string | number, filePath: string, ref: string): Promise<string | null> {
        try {
            const res = await this.api.get<string>(`/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}/raw`, {
                params: { ref },
                // GitLab returns the raw file: keep it as text, axios would try to parse JSON otherwise
                transformResponse: [data => data]
            })
            return res.data
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return null
            }
            throw error
        }
    }

    /**
     * Commits a set of file changes. When `startBranch` is provided GitLab creates `branch`
     * from it as part of the same call.
     */
    async commitFiles(projectId: string | number, request: CommitFilesRequest): Promise<void> {
        await this.api.post(`/projects/${projectId}/repository/commits`, {
            branch: request.branch,
            start_branch: request.startBranch,
            commit_message: request.commitMessage,
            actions: request.actions
        })
    }

    async branchExists(projectId: string | number, branchName: string): Promise<boolean> {
        try {
            await this.api.get(`/projects/${projectId}/repository/branches/${encodeURIComponent(branchName)}`)
            return true
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return false
            }
            throw error
        }
    }
}

export default GitLabClient
