/** What a repository is imported as */
export type ImportTarget = "microfrontend" | "service"

interface ImportRepositoriesDTO {
    /** Provider repository ids to import. When empty or omitted, every repository that is not imported yet is taken. */
    repositoryIds?: string[]
    /** GitLab only: import from this group instead of the one configured on the connection. */
    groupId?: number
    /** Initial version given to every created microfrontend. A service gets its version from the CI. */
    version?: string
    /** One microfrontend per repository when omitted, one service otherwise. */
    target?: ImportTarget
    /** The functional domain of the project every created member is put in. */
    domainId?: string
}

export default ImportRepositoriesDTO
