import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { logWarn } = vi.hoisted(() => ({ logWarn: vi.fn() }))

// `recordLogin` reads the app instance from the entry point, and importing that
// entry point would start the server: of it, only the logger is needed here.
vi.mock("..", () => ({ fastify: { log: { warn: logWarn } } }))

import User, { IUser } from "../models/UserModel"
import { FEDERATED_LOGIN_WINDOW_MS, recordLogin } from "./UserService"

const anAccessedUser = (lastLoginAt?: Date): Pick<IUser, "_id" | "lastLoginAt"> => ({
    _id: new Types.ObjectId() as unknown as IUser["_id"],
    lastLoginAt
})

const NOON = new Date("2026-08-11T12:00:00.000Z")
const minutesBefore = (date: Date, minutes: number) => new Date(date.getTime() - minutes * 60 * 1000)

describe("recordLogin", () => {
    let updateOne: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        logWarn.mockClear()
        updateOne = vi.spyOn(User, "updateOne").mockResolvedValue({} as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it("given a user who never signed in, when an access is recorded, then the date is stored without bumping the update timestamps", async () => {
        const user = anAccessedUser()

        await recordLogin(user, NOON)

        expect(updateOne).toHaveBeenCalledWith({ _id: user._id }, { lastLoginAt: NOON }, { timestamps: false })
    })

    it("given no explicit moment, when an access is recorded, then it is dated now", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(NOON)

        await recordLogin(anAccessedUser())

        expect(updateOne).toHaveBeenCalledWith(expect.anything(), { lastLoginAt: NOON }, expect.anything())
    })

    it("given a stored date older than the access, when the access is recorded, then the newer date replaces it", async () => {
        const user = anAccessedUser(minutesBefore(NOON, 60))

        await recordLogin(user, NOON)

        expect(updateOne).toHaveBeenCalledWith(expect.anything(), { lastLoginAt: NOON }, expect.anything())
    })

    it("given the access moment is already the stored one, when the same token is seen again, then nothing is written", async () => {
        const user = anAccessedUser(NOON)

        await recordLogin(user, NOON)

        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given a stored date newer than the access, when the older access is recorded, then nothing is written", async () => {
        const user = anAccessedUser(NOON)

        await recordLogin(user, minutesBefore(NOON, 30))

        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given the federated window, when the previous access falls inside it, then nothing is written", async () => {
        const user = anAccessedUser(minutesBefore(NOON, 5))

        await recordLogin(user, NOON, FEDERATED_LOGIN_WINDOW_MS)

        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given the federated window, when the previous access falls outside it, then the date is stored", async () => {
        const user = anAccessedUser(minutesBefore(NOON, 20))

        await recordLogin(user, NOON, FEDERATED_LOGIN_WINDOW_MS)

        expect(updateOne).toHaveBeenCalledWith(expect.anything(), { lastLoginAt: NOON }, expect.anything())
    })

    it("given a failing write, when an access is recorded, then the caller is not affected and the failure is logged", async () => {
        updateOne.mockRejectedValue(new Error("write timeout") as never)

        await expect(recordLogin(anAccessedUser(), NOON)).resolves.toBeUndefined()
        expect(logWarn).toHaveBeenCalledTimes(1)
    })
})
