import { EntityNotFoundError } from "./EntityNotFoundError"

export class OrganizationNotFoundError extends EntityNotFoundError {
    public readonly code = "ORGANIZATION_NOT_FOUND"

    constructor(organizationId: string, message?: string) {
        super(organizationId, message ?? `Organization not found: ${organizationId}`)
        this.name = "OrganizationNotFoundError"
        Object.setPrototypeOf(this, OrganizationNotFoundError.prototype)
    }

    static isInstance(error: unknown): error is OrganizationNotFoundError {
        return error instanceof OrganizationNotFoundError
    }
}
