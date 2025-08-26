import CustomError from "./CustomError"

export class UserNotFoundError extends CustomError {
    public readonly email: string

    constructor(email: string) {
        super(`User with email ${email} not found`)
        this.name = "UserNotFoundError"
        this.email = email
        Object.setPrototypeOf(this, UserNotFoundError.prototype)
    }

    static isInstance(error: unknown): error is UserNotFoundError {
        return error instanceof UserNotFoundError
    }
}
