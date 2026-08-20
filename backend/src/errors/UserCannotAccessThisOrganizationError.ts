import { IUser } from "../models/UserModel"
import CustomError from "./CustomError"

export default class UserCannotAccessThisOrganizationError extends CustomError {
    constructor(user?: IUser) {
        super(`User ${user?.email} cannot access this organization`)
        this.name = "UserCannotAccessThisOrganizationError"
        Object.setPrototypeOf(this, UserCannotAccessThisOrganizationError.prototype)
    }

    static isInstance(error: unknown): error is UserCannotAccessThisOrganizationError {
        return error instanceof UserCannotAccessThisOrganizationError
    }
}
