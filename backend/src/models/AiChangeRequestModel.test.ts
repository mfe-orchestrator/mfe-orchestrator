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

    it.each([
        ["a microfrontend", { microfrontendId: new Types.ObjectId() }],
        ["a service", { serviceId: new Types.ObjectId() }]
    ])("Given a request on %s, when it is validated, then it is valid", async (_owner, owner) => {
        await expect(request(owner).validate()).resolves.toBeUndefined()
    })

    it.each([
        ["neither", {}],
        ["both", { microfrontendId: new Types.ObjectId(), serviceId: new Types.ObjectId() }]
    ])("Given a request on %s a microfrontend nor a service, when it is validated, then it is refused", async (_owner, owner) => {
        await expect(request(owner).validate()).rejects.toThrow(/Exactly one of microfrontendId and serviceId/)
    })
})
