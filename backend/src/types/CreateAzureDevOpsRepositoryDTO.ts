export default interface CreateAzureDevOpsRepositoryDTO {
    /**
     * Personal Access Token for GitLab API authentication
     * @example "glpat-xxxxxxxxxxxxxxxxxxxx"
     */
    pat: string

    /**
     * Display name for the repository
     * @example "My Awesome Project"
     */
    name: string

    organization: string

    /**
     * Project identifier this repository belongs to
     * @example "project-123"
     */
    projectId: string

    projectName: string
}
