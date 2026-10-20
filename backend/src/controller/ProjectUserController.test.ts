import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessException } from "../errors/BusinessException"
import projectUserController from "./ProjectUserController"

const updateUserRole = vi.fn()
const removeUserFromProject = vi.fn()

vi.mock("../service/UserProjectService", () => ({
    PROJECT_LAST_OWNER: "PROJECT_LAST_OWNER",
    default: class {
        updateUserRole = updateUserRole
        removeUserFromProject = removeUserFromProject
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const MEMBER = "bbbbbbbbbbbbbbbbbbbbbbbb"

describe("ProjectUserController", () => {
    let app: FastifyInstance

    beforeEach(async () => {
        updateUserRole.mockReset()
        removeUserFromProject.mockReset()
        app = Fastify()
        await app.register(projectUserController)
    })

    afterEach(async () => {
        await app.close()
    })

    it("Given a role change, when it succeeds, then the service's membership comes back with the usual message", async () => {
        updateUserRole.mockResolvedValue({ userId: MEMBER, role: "VIEWER" })

        const response = await app.inject({ method: "PUT", url: `/projects/${PROJECT}/users/${MEMBER}`, payload: { role: "VIEWER" } })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ message: "User role updated successfully", userProject: { userId: MEMBER, role: "VIEWER" } })
        expect(updateUserRole).toHaveBeenCalledWith(PROJECT, MEMBER, "VIEWER", undefined)
    })

    it("Given a removal, when it succeeds, then the answer is empty", async () => {
        removeUserFromProject.mockResolvedValue(undefined)

        const response = await app.inject({ method: "DELETE", url: `/projects/${PROJECT}/users/${MEMBER}` })

        expect(response.statusCode).toBe(204)
        expect(removeUserFromProject).toHaveBeenCalledWith(PROJECT, MEMBER)
    })

    /** The console toasts `message` of the answer as it is. */
    it("Given the last owner, when removed, then the refusal keeps the shape the console reads", async () => {
        removeUserFromProject.mockRejectedValue(createBusinessException({ code: "PROJECT_LAST_OWNER", message: "Cannot remove the last owner of the project." }))

        const response = await app.inject({ method: "DELETE", url: `/projects/${PROJECT}/users/${MEMBER}` })

        expect(response.statusCode).toBe(400)
        expect(response.json()).toEqual({ message: "Cannot remove the last owner of the project." })
    })

    it("Given a user who does not own the project, when they remove a member, then the refusal is not swallowed", async () => {
        removeUserFromProject.mockRejectedValue(createBusinessException({ code: "PROJECT_OWNER_REQUIRED", message: "Only an owner", statusCode: 403 }))

        const response = await app.inject({ method: "DELETE", url: `/projects/${PROJECT}/users/${MEMBER}` })

        expect(response.statusCode).toBe(403)
    })
})
