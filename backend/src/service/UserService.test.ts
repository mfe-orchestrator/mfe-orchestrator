import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { logWarn } = vi.hoisted(() => ({ logWarn: vi.fn() }))

// `recordLogin` reads the app instance from the entry point, and importing that
// entry point would start the server: of it, only the logger is needed here.
vi.mock("..", () => ({ fastify: { log: { warn: logWarn } } }))

import { MultipartFile } from "@fastify/multipart"
import { BusinessException } from "../errors/BusinessException"
import UserAvatar, { MAX_AVATAR_SIZE_BYTES } from "../models/UserAvatarModel"
import User, { IUser } from "../models/UserModel"
import EmailService from "./EmailSenderService"
import { FEDERATED_LOGIN_WINDOW_MS, recordLogin, UserService } from "./UserService"

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

/**
 * L'upload dell'avatar: il parser multipart ha gia' il suo limite, ma qui si
 * verifica il controllo del servizio, che e' quello che regge anche quando la
 * richiesta dichiara una dimensione diversa da quella dei byte che manda.
 */
describe("saveAvatar", () => {
    const userId = new Types.ObjectId() as unknown as IUser["_id"]
    // L'EmailService non serve a nessuno dei metodi sotto test, e costruirlo
    // aprirebbe un transport SMTP a partire da una configurazione che qui non c'e'.
    const userService = new UserService({} as EmailService)

    const anUploadedFile = (mimetype: string, data: Buffer): MultipartFile => ({ mimetype, toBuffer: async () => data }) as unknown as MultipartFile

    let updateOne: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        updateOne = vi.spyOn(UserAvatar, "updateOne").mockResolvedValue({} as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("given an image within the limits, when it is saved, then it is stored for the user", async () => {
        const data = Buffer.from("a png", "utf8")

        await userService.saveAvatar(anUploadedFile("image/png", data), userId)

        expect(updateOne).toHaveBeenCalledWith(expect.anything(), { data, mimeType: "image/png", size: data.length }, { upsert: true })
    })

    it("given a user who already has one, when a new image is saved, then it replaces the previous one", async () => {
        await userService.saveAvatar(anUploadedFile("image/webp", Buffer.from("a webp", "utf8")), userId)

        // Un solo documento per utente: l'upsert e' quello che rende la seconda
        // immagine una sostituzione invece di una seconda riga.
        expect(updateOne).toHaveBeenCalledWith(expect.anything(), expect.anything(), { upsert: true })
    })

    it("given a format outside the whitelist, when it is saved, then it is refused and nothing is written", async () => {
        const svg = anUploadedFile("image/svg+xml", Buffer.from("<svg onload='alert(1)'/>", "utf8"))

        await expect(userService.saveAvatar(svg, userId)).rejects.toMatchObject({ code: "AVATAR_INVALID_FORMAT" })
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given an empty file, when it is saved, then it is refused and nothing is written", async () => {
        const empty = anUploadedFile("image/png", Buffer.alloc(0))

        await expect(userService.saveAvatar(empty, userId)).rejects.toBeInstanceOf(BusinessException)
        await expect(userService.saveAvatar(empty, userId)).rejects.toMatchObject({ code: "AVATAR_EMPTY" })
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given more bytes than the limit allows, when they are saved, then they are refused and nothing is written", async () => {
        const oversized = anUploadedFile("image/jpeg", Buffer.alloc(MAX_AVATAR_SIZE_BYTES + 1))

        await expect(userService.saveAvatar(oversized, userId)).rejects.toMatchObject({ code: "AVATAR_TOO_LARGE" })
        expect(updateOne).not.toHaveBeenCalled()
    })

    it("given exactly the maximum size, when it is saved, then it is accepted", async () => {
        await userService.saveAvatar(anUploadedFile("image/gif", Buffer.alloc(MAX_AVATAR_SIZE_BYTES)), userId)

        expect(updateOne).toHaveBeenCalledTimes(1)
    })
})

describe("getAvatar", () => {
    const userId = new Types.ObjectId() as unknown as IUser["_id"]
    const userService = new UserService({} as EmailService)

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("given a stored image, when it is read, then it comes back as a data URI", async () => {
        const data = Buffer.from("bytes", "utf8")
        vi.spyOn(UserAvatar, "findOne").mockResolvedValue({ data, mimeType: "image/png" } as never)

        await expect(userService.getAvatar(userId)).resolves.toBe(`data:image/png;base64,${data.toString("base64")}`)
    })

    it("given a user who never uploaded one, when it is read, then there is nothing to serve", async () => {
        vi.spyOn(UserAvatar, "findOne").mockResolvedValue(null as never)

        await expect(userService.getAvatar(userId)).resolves.toBeNull()
    })
})
