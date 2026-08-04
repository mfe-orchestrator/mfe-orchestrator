import { BusinessException } from "./BusinessException"

/**
 * Thrown when a project whose creation wizard is still running is accessed
 * from outside the wizard itself. 423 Locked: the resource exists, the user is
 * allowed to see it, but it is not usable until the wizard is completed.
 */
export class ProjectWizardNotCompletedError extends BusinessException {
    constructor(projectId: string, currentStep: string) {
        super({
            code: "PROJECT_WIZARD_NOT_COMPLETED",
            message: "The project setup wizard has not been completed yet",
            statusCode: 423,
            details: { projectId, currentStep }
        })
        this.name = "ProjectWizardNotCompletedError"
        Object.setPrototypeOf(this, ProjectWizardNotCompletedError.prototype)
    }

    static isInstance(error: unknown): error is ProjectWizardNotCompletedError {
        return error instanceof ProjectWizardNotCompletedError
    }
}

export default ProjectWizardNotCompletedError
