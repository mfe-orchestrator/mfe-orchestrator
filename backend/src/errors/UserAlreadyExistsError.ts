import CustomError from "./CustomError"

export class UserAlreadyExistsError extends CustomError {
    public readonly email: string

    constructor(email: string) {
        super(`User with email ${email} already exists`)
        this.name = "UserAlreadyExistsError"
        this.email = email
        Object.setPrototypeOf(this, UserAlreadyExistsError.prototype)
    }

    static isInstance(error: unknown): error is UserAlreadyExistsError {
        return error instanceof UserAlreadyExistsError
    }
}
