import { BusinessException } from "./BusinessException"

/** An AI feature was called where no AI is available: the organization defines none the project may use, and the installation has no system AI. */
export default class AssistantDisabledError extends BusinessException {
    constructor() {
        super({
            code: "ASSISTANT_DISABLED",
            message: "No AI is available to this project",
            statusCode: 404
        })
        this.name = "AssistantDisabledError"
        Object.setPrototypeOf(this, AssistantDisabledError.prototype)
    }
}
