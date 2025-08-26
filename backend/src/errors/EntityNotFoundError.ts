import CustomError from "./CustomError"

export class EntityNotFoundError extends CustomError {
    public readonly entityId: string

    constructor(entityId: string) {
        super(`Entity not found with id ${entityId}`)
        this.name = "EntityNotFoundError"
        this.entityId = entityId
        Object.setPrototypeOf(this, EntityNotFoundError.prototype)
    }

    static isInstance(error: unknown): error is EntityNotFoundError {
        return error instanceof EntityNotFoundError
    }
}
