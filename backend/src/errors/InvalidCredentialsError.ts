import CustomError from "./CustomError"

export class InvalidCredentialsError extends CustomError {
    constructor() {
        super("Invalid email or password")
        this.name = "InvalidCredentialsError"
        Object.setPrototypeOf(this, InvalidCredentialsError.prototype)
    }

    static isInstance(error: unknown): error is InvalidCredentialsError {
        return error instanceof InvalidCredentialsError
    }
}
