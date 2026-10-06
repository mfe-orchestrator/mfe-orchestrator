import { BusinessException } from "./BusinessException"

/** The assistant was called on an installation that has no ANTHROPIC_API_KEY. */
export default class AssistantDisabledError extends BusinessException {
    constructor() {
        super({
            code: "ASSISTANT_DISABLED",
            message: "The assistant is not enabled on this installation",
            statusCode: 404
        })
        this.name = "AssistantDisabledError"
        Object.setPrototypeOf(this, AssistantDisabledError.prototype)
    }
}
