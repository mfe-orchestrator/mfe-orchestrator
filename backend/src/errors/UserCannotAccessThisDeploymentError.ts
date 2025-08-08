import { IUser } from "../models/UserModel"
import CustomError from "./CustomError"

export default class UserCannotAccessThisDeploymentError extends CustomError {
    constructor(user?: IUser) {
        super(`User ${user?.email} cannot access this deployment`)
        this.name = "UserCannotAccessThisDeploymentError"
        Object.setPrototypeOf(this, UserCannotAccessThisDeploymentError.prototype)
    }

    static isInstance(error: unknown): error is UserCannotAccessThisDeploymentError {
        return error instanceof UserCannotAccessThisDeploymentError
    }
}
