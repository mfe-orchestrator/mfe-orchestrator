import CustomError from "./CustomError"

/**
 * An error the OAuth endpoints answer in the RFC 6749 §5.2 shape (`error`, `error_description`)
 * rather than in the console's own error envelope: OAuth clients parse exactly those two fields.
 */
export class OAuthError extends CustomError {
    public readonly error: string
    public readonly statusCode: number

    constructor(error: string, description: string, statusCode = 400) {
        super(description)
        this.name = "OAuthError"
        this.error = error
        this.statusCode = statusCode
        Object.setPrototypeOf(this, OAuthError.prototype)
    }

    toResponse() {
        return { error: this.error, error_description: this.message }
    }

    static isInstance(error: unknown): error is OAuthError {
        return error instanceof OAuthError
    }
}

export default OAuthError
