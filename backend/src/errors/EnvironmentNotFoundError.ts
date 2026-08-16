import { EntityNotFoundError } from "./EntityNotFoundError"

/**
 * A missing environment is the most common misconfiguration on the serving path, and it is worth
 * telling apart from any other missing entity: the host page gets back which environment could not
 * be found instead of a bare "Entity not found with id Environment".
 */
export class EnvironmentNotFoundError extends EntityNotFoundError {
    public readonly code = "ENVIRONMENT_NOT_FOUND"

    constructor(environmentId: string, message?: string) {
        super(environmentId, message ?? `Environment not found: ${environmentId}`)
        this.name = "EnvironmentNotFoundError"
        Object.setPrototypeOf(this, EnvironmentNotFoundError.prototype)
    }

    /**
     * The "auto" urls pick the environment by matching the calling domain against the domains
     * registered on each environment of the project, so a failure here is not a missing record: it is
     * a domain nobody registered. Saying so is the difference between a five minute fix on the console
     * and a hunt through the backend logs.
     */
    static fromDomain(domain: string, projectId: string): EnvironmentNotFoundError {
        return new EnvironmentNotFoundError(
            domain,
            `No environment of project ${projectId} has "${domain}" among its registered domains, so the environment cannot be resolved from the calling domain. Register it on the environment, or address the microfrontend with an url that names the environment.`
        )
    }

    static isInstance(error: unknown): error is EnvironmentNotFoundError {
        return error instanceof EnvironmentNotFoundError
    }
}
