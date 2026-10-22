import { Types } from "mongoose"
import { describe, expect, it } from "vitest"
import AiChangeRequest, { AiChangeStatus } from "./AiChangeRequestModel"

const request = (owner: Record<string, unknown>) =>
    new AiChangeRequest({
        projectId: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        conversationId: new Types.ObjectId(),
        prompt: "Add a 404 page",
        baseBranch: "main",
        status: AiChangeStatus.PENDING,
        ...owner
    })

describe("AiChangeRequest", () => {
    it("Given a request without its conversation, when it is validated, then it is refused", async () => {
        await expect(request({ microfrontendId: new Types.ObjectId(), conversationId: undefined }).validate()).rejects.toThrow(/conversationId/)
    })

    it("Given a request on a microfrontend, when it is validated, then it is valid", async () => {
        await expect(request({ microfrontendId: new Types.ObjectId() }).validate()).resolves.toBeUndefined()
    })

    it("Given a request without its microfrontend, when it is validated, then it is refused", async () => {
        await expect(request({}).validate()).rejects.toThrow(/microfrontendId/)
    })
})
