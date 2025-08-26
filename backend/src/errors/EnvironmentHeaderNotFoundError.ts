import CustomError from "./CustomError"

export default class EnvironmentHeaderNotFoundError extends CustomError {
    constructor() {
        super(`Environment has not been found`)
        this.name = "EnvironmentHeaderNotFoundError"
        Object.setPrototypeOf(this, EnvironmentHeaderNotFoundError.prototype)
    }

    static isInstance(error: unknown): error is EnvironmentHeaderNotFoundError {
        return error instanceof EnvironmentHeaderNotFoundError
    }
}
