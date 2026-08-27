import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const existsAtLeastOneUser = vi.fn()
const register = vi.fn()
const createOrganization = vi.fn()
const createProject = vi.fn()

vi.mock("../service/UserService", () => ({
    default: class {
        existsAtLeastOneUser = existsAtLeastOneUser
        register = register
    }
}))

vi.mock("../service/OrganizationService", () => ({
    default: class {
        create = createOrganization
    }
}))

vi.mock("../service/ProjectService", () => ({
    default: class {
        create = createProject
    }
}))

import errorHandler from "../plugins/errorHandler"
import StartupController from "./StartupController"

/**
 * The first-startup route is public by necessity: on an empty installation there is nobody to
 * authenticate as. What has to close it is the state it exists for, and it did not - it stayed
 * open forever, so a call against a populated installation created another user with an
 * organization and a project of their own.
 */
describe("StartupController", () => {
    let app: FastifyInstance

    const aRegistration = { email: "founder@example.com", password: "a-strong-password", project: "Acme" }

    beforeEach(async () => {
        existsAtLeastOneUser.mockReset()
        register.mockReset()
        createOrganization.mockReset()
        createProject.mockReset()

        register.mockResolvedValue({ _id: "user-1", toFrontendObject: () => ({ _id: "user-1", email: aRegistration.email }) })
        createOrganization.mockResolvedValue({ _id: { toString: () => "org-1" }, name: "Acme" })
        createProject.mockResolvedValue({ _id: "project-1", name: "Acme" })

        app = Fastify()
        // The route answers with a 409, which is the error handler's job to turn into a status.
        await app.register(errorHandler)
        await app.register(StartupController)
        await app.ready()
    })

    afterEach(async () => {
        await app.close()
    })

    it("Given an installation with no users, when the first registration is posted, then the user, the organization and the project are created", async () => {
        existsAtLeastOneUser.mockResolvedValue(false)

        const response = await app.inject({ method: "POST", url: "/startup/registration", payload: aRegistration })

        expect(response.statusCode).toBe(200)
        expect(register).toHaveBeenCalledTimes(1)
        expect(createOrganization).toHaveBeenCalledTimes(1)
        expect(createProject).toHaveBeenCalledTimes(1)
    })

    it("Given an installation that already has a user, when the first registration is posted, then it is refused", async () => {
        existsAtLeastOneUser.mockResolvedValue(true)

        const response = await app.inject({ method: "POST", url: "/startup/registration", payload: aRegistration })

        expect(response.statusCode).toBe(409)
    })

    it("Given an installation that already has a user, when the first registration is posted, then nothing at all is created", async () => {
        existsAtLeastOneUser.mockResolvedValue(true)

        await app.inject({ method: "POST", url: "/startup/registration", payload: aRegistration })

        // The whole point: before the guard this call went through and left a second owner behind.
        expect(register).not.toHaveBeenCalled()
        expect(createOrganization).not.toHaveBeenCalled()
        expect(createProject).not.toHaveBeenCalled()
    })

    it("Given a project name with several spaces, when the first registration is posted, then every space is in the slug", async () => {
        existsAtLeastOneUser.mockResolvedValue(false)

        await app.inject({ method: "POST", url: "/startup/registration", payload: { ...aRegistration, project: "My Cool Storefront App" } })

        // Each replace was hitting only the first occurrence, so this used to be stored as
        // "my-cool storefront app" - and the slug cannot be corrected afterwards.
        expect(createProject.mock.calls[0][0]).toMatchObject({ slug: "my-cool-storefront-app" })
    })

    it("Given a project name with underscores and dots, when the first registration is posted, then all of them become hyphens", async () => {
        existsAtLeastOneUser.mockResolvedValue(false)

        await app.inject({ method: "POST", url: "/startup/registration", payload: { ...aRegistration, project: "v1.2.3_rc_beta" } })

        expect(createProject.mock.calls[0][0]).toMatchObject({ slug: "v1-2-3-rc-beta" })
    })

    it("Given an installation with no users, when it is asked whether one exists, then it says no", async () => {
        existsAtLeastOneUser.mockResolvedValue(false)

        const response = await app.inject({ method: "GET", url: "/startup/users/exists" })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual({ exists: false })
    })
})
