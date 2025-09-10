export default interface CreateGitlabRepositoryDto {
    /**
     * The URL of the GitLab repository
     * @example "https://gitlab.com/username/repository"
     */
    url: string;

    /**
     * Personal Access Token for GitLab API authentication
     * @example "glpat-xxxxxxxxxxxxxxxxxxxx"
     */
    pat: string;

    /**
     * Display name for the repository
     * @example "My Awesome Project"
     */
    name: string;

    /**
     * Project identifier this repository belongs to
     * @example "project-123"
     */
    project: string;
}
