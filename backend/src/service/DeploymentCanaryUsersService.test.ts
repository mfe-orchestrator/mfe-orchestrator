import { ClientSession, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import DeploymentToCanaryUsers, { IDeploymentToCanaryUsers } from "../models/DeploymentsToCanaryUsersModel"
import DeploymentCanaryUsersService from "./DeploymentCanaryUsersService"

const A_DEPLOYMENT_ID = new Types.ObjectId().toString()
const A_SESSION = { id: "a-session" } as unknown as ClientSession

/**
 * Every database call appends to this log, so a test can tell a sequential run
 * ("read 12, write 12, read 13") from a parallel one ("read 12, read 13, ...").
 */
let calls: string[]

/** The rows findOne is allowed to return, by user id: anything missing is a user with no row yet. */
let storedRows: Map<string, ReturnType<typeof anExistingRow>>

const anExistingRow = (userId: string) => ({
    userId,
    enabled: false,
    save: vi.fn(async (options?: { session?: ClientSession }) => {
        await tick()
        calls.push(`update:${userId}${options?.session ? ":in-session" : ""}`)
    })
})

/** Pushes the resolution a few microtasks away, so overlapping calls would interleave in the log. */
const tick = async () => {
    for (let i = 0; i < 3; i++) {
        await Promise.resolve()
    }
}

describe("setCanaryUserMultipleRaw", () => {
    beforeEach(() => {
        calls = []
        storedRows = new Map()

        vi.spyOn(DeploymentToCanaryUsers, "findOne").mockImplementation(((filter: { userId: string }) => ({
            session: async (session: ClientSession | null) => {
                calls.push(`read:${filter.userId}${session ? ":in-session" : ""}`)
                await tick()
                return storedRows.get(filter.userId) ?? null
            }
        })) as never)

        vi.spyOn(DeploymentToCanaryUsers.prototype, "save").mockImplementation(async function (this: IDeploymentToCanaryUsers, options?: { session?: ClientSession }) {
            await tick()
            calls.push(`insert:${this.userId}${options?.session ? ":in-session" : ""}`)
            return this
        } as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("Given several users enrolled in one call, when they are written inside a transaction, then each user is read and written before the next one starts", async () => {
        storedRows.set("12", anExistingRow("12"))

        await new DeploymentCanaryUsersService().setCanaryUserMultipleRaw(A_DEPLOYMENT_ID, ["12", "13"], true, A_SESSION)

        // Running the two users concurrently would send two commands on the same session with the same
        // transaction number, which MongoDB rejects with "Only servers in a sharded cluster can start a
        // new transaction at the active transaction number".
        expect(calls).toEqual(["read:12:in-session", "update:12:in-session", "read:13:in-session", "insert:13:in-session"])
    })

    it("Given a session, when the users are enrolled, then every read and every write is bound to it", async () => {
        await new DeploymentCanaryUsersService().setCanaryUserMultipleRaw(A_DEPLOYMENT_ID, ["12", "13"], true, A_SESSION)

        expect(calls.every(call => call.endsWith(":in-session"))).toBe(true)
    })

    it("Given a user already enrolled, when the enrolment is set again, then the existing row is updated instead of a second one being inserted", async () => {
        const existingRow = anExistingRow("12")
        storedRows.set("12", existingRow)

        await new DeploymentCanaryUsersService().setCanaryUserMultipleRaw(A_DEPLOYMENT_ID, ["12"], true, A_SESSION)

        expect(existingRow.enabled).toBe(true)
        expect(calls).not.toContain("insert:12:in-session")
    })

    it("Given a mix of enrolled and new users, when they are written, then the rows come back in the order they were asked for", async () => {
        storedRows.set("13", anExistingRow("13"))

        const rows = await new DeploymentCanaryUsersService().setCanaryUserMultipleRaw(A_DEPLOYMENT_ID, ["12", "13"], true, A_SESSION)

        expect(rows.map(row => row.userId)).toEqual(["12", "13"])
    })

    it("Given no session, when the users are enrolled outside a transaction, then they are still written one at a time", async () => {
        await new DeploymentCanaryUsersService().setCanaryUserMultipleRaw(A_DEPLOYMENT_ID, ["12", "13"], true)

        expect(calls).toEqual(["read:12", "insert:12", "read:13", "insert:13"])
    })
})
