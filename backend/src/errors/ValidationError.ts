import CustomError from "./CustomError"

class ValidationError extends CustomError {
    constructor(message: string) {
        super(message)
        this.name = "ValidationError"
        Object.setPrototypeOf(this, ValidationError.prototype)
    }

    static isInstance(error: unknown): error is ValidationError {
        return error instanceof ValidationError
    }
}

export default ValidationError
