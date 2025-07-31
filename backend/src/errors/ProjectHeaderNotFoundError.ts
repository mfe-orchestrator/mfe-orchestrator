import CustomError from "./CustomError";

export default class ProjectHeaderNotFoundError extends CustomError {

    constructor() {
        super(`Project has not been found`);
        this.name = 'ProjectHeaderNotFoundError';
        Object.setPrototypeOf(this, ProjectHeaderNotFoundError.prototype);
    }

    static isInstance(error: unknown): error is ProjectHeaderNotFoundError {
        return error instanceof ProjectHeaderNotFoundError
        ;
    }
}