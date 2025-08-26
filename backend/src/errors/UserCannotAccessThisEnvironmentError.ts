import { IUser } from "../models/UserModel"
import CustomError from "./CustomError"

export default class UserCannotAccessThisEnvironmentError extends CustomError {
    constructor(user?: IUser) {
        super(`User ${user?.email} cannot access this environment`)
        this.name = "UserCannotAccessThisEnvironmentError"
        Object.setPrototypeOf(this, UserCannotAccessThisEnvironmentError.prototype)
    }

    static isInstance(error: unknown): error is UserCannotAccessThisEnvironmentError {
        return error instanceof UserCannotAccessThisEnvironmentError
    }
}
