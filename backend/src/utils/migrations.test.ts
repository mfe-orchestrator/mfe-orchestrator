import { beforeEach, describe, expect, it, vi } from "vitest"
import { removeAssistantConversationExpiry } from "./migrations"

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
