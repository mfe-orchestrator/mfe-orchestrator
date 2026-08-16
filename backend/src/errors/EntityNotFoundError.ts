import CustomError from "./CustomError"

export class EntityNotFoundError extends CustomError {
    public readonly entityId: string

    /**
     * Fastify reads statusCode off the error to pick the response code, and without it a missing
     * entity came out as a 500: a host page asking for an environment that is not configured looked
     * like the server had crashed, both to the caller and in the logs.
     */
    public readonly statusCode = 404

    /** Discriminator the caller can branch on, serialized into the response body by Fastify. */
    public readonly code: string = "ENTITY_NOT_FOUND"

    /**
     * @param message Overrides the default wording. Subclasses use it to say which kind of entity is
     * missing and, where it helps, what was looked up.
     */
    constructor(entityId: string, message?: string) {
        super(message ?? `Entity not found with id ${entityId}`)
        this.name = "EntityNotFoundError"
        this.entityId = entityId
        Object.setPrototypeOf(this, EntityNotFoundError.prototype)
    }

    static isInstance(error: unknown): error is EntityNotFoundError {
        return error instanceof EntityNotFoundError
    }
}
