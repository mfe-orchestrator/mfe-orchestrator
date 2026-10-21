import { Types } from "mongoose"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AiChangeJob from "../models/AiChangeJobModel"
import AiChangeRequest from "../models/AiChangeRequestModel"
import { backfillAiChangeConversations, removeAssistantConversationExpiry } from "./migrations"

const dropIndex = vi.fn()
const updateMany = vi.fn()

vi.mock("../models/AssistantConversationModel", () => ({
    default: { collection: { dropIndex: (...args: unknown[]) => dropIndex(...args), updateMany: (...args: unknown[]) => updateMany(...args) } }
}))

const logger = { info: vi.fn(), error: vi.fn() } as never

describe("removeAssistantConversationExpiry", () => {
    beforeEach(() => {
        dropIndex.mockReset().mockResolvedValue(undefined)
        updateMany.mockReset().mockResolvedValue({ modifiedCount: 0 })
    })

    it("Given the expiry index of the first version, when it runs, then the index and the expiry dates are removed", async () => {
        updateMany.mockResolvedValue({ modifiedCount: 3 })

        await removeAssistantConversationExpiry(logger)

        expect(dropIndex).toHaveBeenCalledWith("expiresAt_1")
        expect(updateMany).toHaveBeenCalledWith({ expiresAt: { $exists: true } }, { $unset: { expiresAt: "" } })
    })

    it.each([
        ["the index is already gone", 27],
        ["the collection does not exist yet", 26]
    ])("Given %s, when it runs, then it carries on", async (_, code) => {
        dropIndex.mockRejectedValue(Object.assign(new Error("not found"), { code }))

        await expect(removeAssistantConversationExpiry(logger)).resolves.toBeUndefined()
        expect(updateMany).toHaveBeenCalled()
    })

    it("Given any other failure on the drop, when it runs, then the error is not swallowed", async () => {
        dropIndex.mockRejectedValue(Object.assign(new Error("not authorized"), { code: 13 }))

        await expect(removeAssistantConversationExpiry(logger)).rejects.toThrow("not authorized")
    })
})

describe("backfillAiChangeConversations", () => {
    const requestFindOne = vi.fn()
    const jobFindOne = vi.fn()
    const requestUpdateOne = vi.fn()

    const backfill = async (requests: Record<string, unknown>[]) => {
        vi.spyOn(AiChangeRequest.collection, "find").mockReturnValue(requests as never)
        vi.spyOn(AiChangeRequest.collection, "findOne").mockImplementation(requestFindOne as never)
        vi.spyOn(AiChangeRequest.collection, "updateOne").mockImplementation(requestUpdateOne as never)
        vi.spyOn(AiChangeJob.collection, "findOne").mockImplementation(jobFindOne as never)
        await backfillAiChangeConversations(logger)
        return Object.fromEntries(requestUpdateOne.mock.calls.map(([filter, update]) => [String(filter._id), String(update.$set.conversationId)]))
    }

    beforeEach(() => {
        vi.restoreAllMocks()
        requestFindOne.mockReset().mockResolvedValue(null)
        jobFindOne.mockReset().mockResolvedValue(null)
        requestUpdateOne.mockReset().mockResolvedValue({})
    })

    it("Given a request made before jobs, when it runs, then the request is a conversation of its own", async () => {
        const id = new Types.ObjectId()

        expect(await backfill([{ _id: id }])).toEqual({ [String(id)]: String(id) })
    })

    it("Given a request whose job is still there, when it runs, then its conversation is the first job of the chain", async () => {
        const id = new Types.ObjectId()
        const rootJobId = new Types.ObjectId()
        jobFindOne.mockResolvedValue({ rootJobId })

        expect(await backfill([{ _id: id, jobId: new Types.ObjectId() }])).toEqual({ [String(id)]: String(rootJobId) })
    })

    it("Given a follow-up whose job expired, when it runs, then the oldest request of the chain names the conversation", async () => {
        const id = new Types.ObjectId()
        const parentId = new Types.ObjectId()
        const rootJobId = new Types.ObjectId()
        requestFindOne.mockImplementation(async ({ _id }: { _id: Types.ObjectId }) => (String(_id) === String(parentId) ? { _id: parentId, jobId: rootJobId } : null))

        expect(await backfill([{ _id: id, jobId: new Types.ObjectId(), parentId }])).toEqual({ [String(id)]: String(rootJobId) })
    })

    it("Given a parent already linked, when it runs, then the follow-up joins the parent's conversation", async () => {
        const id = new Types.ObjectId()
        const parentId = new Types.ObjectId()
        const conversationId = new Types.ObjectId()
        requestFindOne.mockResolvedValue({ _id: parentId, jobId: new Types.ObjectId(), conversationId })

        expect(await backfill([{ _id: id, jobId: new Types.ObjectId(), parentId }])).toEqual({ [String(id)]: String(conversationId) })
    })
})
