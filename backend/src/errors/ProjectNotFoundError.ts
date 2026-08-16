import { EntityNotFoundError } from "./EntityNotFoundError"

/**
 * Counterpart of EnvironmentNotFoundError for the other identifier every serving url carries: with
 * both spelled out, a 404 on those urls says whether the project id is wrong or the environment is.
 */
export class ProjectNotFoundError extends EntityNotFoundError {
    public readonly code = "PROJECT_NOT_FOUND"

    constructor(projectId: string, message?: string) {
        super(projectId, message ?? `Project not found: ${projectId}`)
        this.name = "ProjectNotFoundError"
        Object.setPrototypeOf(this, ProjectNotFoundError.prototype)
    }

    static isInstance(error: unknown): error is ProjectNotFoundError {
        return error instanceof ProjectNotFoundError
    }
}
