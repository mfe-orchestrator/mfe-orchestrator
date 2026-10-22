import { afterEach, describe, expect, it, vi } from "vitest"
import { createPendingAction, PENDING_ACTION_TTL_MS, takePendingAction } from "./pendingActions"

const redis = vi.hoisted(() => ({ client: undefined as unknown }))

vi.mock("../../plugins/redis", () => ({
    get redisClient() {
        return redis.client
    }
}))

const parked = () => createPendingAction({ userId: "user-1", projectId: "project-1", tool: "environment_delete", args: { environmentId: "env-1" }, callId: "call-1" })

describe("pending assistant actions", () => {
    afterEach(() => {
        vi.useRealTimers()
        redis.client = undefined
    })

    it("Given a parked action, when it is created, then its id is long and random and it expires in 15 minutes", async () => {
        const first = await parked()
        const second = await parked()

        expect(first.id).not.toBe(second.id)
        expect(first.id.length).toBeGreaterThanOrEqual(32)
        expect(first.expiresAt - first.createdAt).toBe(PENDING_ACTION_TTL_MS)
    })

    it("Given a parked action, when it is taken twice, then the second take fails: it is single use", async () => {
        const action = await parked()

        await expect(takePendingAction(action.id, "user-1", "project-1")).resolves.toMatchObject({ tool: "environment_delete", callId: "call-1", args: { environmentId: "env-1" } })
        await expect(takePendingAction(action.id, "user-1", "project-1")).rejects.toMatchObject({ code: "ASSISTANT_ACTION_NOT_FOUND", statusCode: 409 })
    })

    it("Given an action of another user or project, when taken, then it is refused and stays available to its owner", async () => {
        const action = await parked()

        await expect(takePendingAction(action.id, "user-2", "project-1")).rejects.toMatchObject({ code: "ASSISTANT_ACTION_NOT_FOUND" })
        await expect(takePendingAction(action.id, "user-1", "project-2")).rejects.toMatchObject({ code: "ASSISTANT_ACTION_NOT_FOUND" })
        await expect(takePendingAction(action.id, "user-1", "project-1")).resolves.toMatchObject({ id: action.id })
    })

    it("Given an action older than 15 minutes, when taken, then it has expired", async () => {
        vi.useFakeTimers()
        const action = await parked()
        vi.advanceTimersByTime(PENDING_ACTION_TTL_MS + 1)

        await expect(takePendingAction(action.id, "user-1", "project-1")).rejects.toMatchObject({ code: "ASSISTANT_ACTION_NOT_FOUND" })
    })

    it("Given Redis, when an action is parked and taken, then it is stored with its TTL under a key bound to user and project, and taken atomically", async () => {
        const store = new Map<string, string>()
        const set = vi.fn(async (key: string, value: string) => {
            store.set(key, value)
            return "OK"
        })
        const evalScript = vi.fn(async (_script: string, { keys }: { keys: string[] }) => {
            const value = store.get(keys[0]) ?? null
            store.delete(keys[0])
            return value
        })
        redis.client = { isOpen: true, set, eval: evalScript }

        const action = await parked()

        expect(set).toHaveBeenCalledWith(`assistant-action:user-1:project-1:${action.id}`, expect.any(String), { PX: PENDING_ACTION_TTL_MS })
        await expect(takePendingAction(action.id, "user-2", "project-1")).rejects.toMatchObject({ code: "ASSISTANT_ACTION_NOT_FOUND" })
        await expect(takePendingAction(action.id, "user-1", "project-1")).resolves.toMatchObject({ id: action.id, tool: "environment_delete" })
        await expect(takePendingAction(action.id, "user-1", "project-1")).rejects.toMatchObject({ code: "ASSISTANT_ACTION_NOT_FOUND" })
        expect(evalScript.mock.calls[0][0]).toContain("del")
    })
})
