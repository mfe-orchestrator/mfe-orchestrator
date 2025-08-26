class CustomError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "CustomError"
    }
}

export default CustomError
