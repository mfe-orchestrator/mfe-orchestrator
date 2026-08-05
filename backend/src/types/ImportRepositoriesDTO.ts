interface ImportRepositoriesDTO {
    /** Provider repository ids to import. When empty or omitted, every repository that is not imported yet is taken. */
    repositoryIds?: string[]
    /** GitLab only: import from this group instead of the one configured on the connection. */
    groupId?: number
    /** Initial version given to every created microfrontend. */
    version?: string
}

export default ImportRepositoriesDTO
