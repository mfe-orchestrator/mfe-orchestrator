export class EntityNotFoundError extends Error {
    public readonly entityId: string;

    constructor(entityId: string) {
        super(`Entity not found with id ${entityId}`);
        this.name = 'EntityNotFoundError';
        this.entityId = entityId;
    }
}