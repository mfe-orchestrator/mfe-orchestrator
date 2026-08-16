import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import { EnvironmentNotFoundError } from "../errors/EnvironmentNotFoundError"
import { ProjectNotFoundError } from "../errors/ProjectNotFoundError"
import errorHandler from "./errorHandler"

describe("errorHandler", () => {
    let app: FastifyInstance

    beforeEach(async () => {
        app = Fastify()
        await app.register(errorHandler)
        app.get("/not-found", async () => {
            throw new EntityNotFoundError("Environment")
        })
        app.get("/no-environment", async () => {
            throw EnvironmentNotFoundError.fromDomain("http://localhost:5173/", "project-1")
        })
        app.get("/no-project", async () => {
            throw new ProjectNotFoundError("project-1")
        })
        app.get("/business", async () => {
            throw createBusinessException({ code: "NOPE", message: "Not allowed" })
        })
        app.get("/boom", async () => {
            throw new Error("Something went wrong")
        })
        await app.ready()
    })

    afterEach(async () => {
        await app.close()
    })

    it("Given a missing entity, when the route throws, then the response is a 404 and not a server error", async () => {
        const response = await app.inject({ method: "GET", url: "/not-found" })

        expect(response.statusCode).toBe(404)
        // The frontend reads the message off the top level of the body to build its error toast.
        expect(response.json().message).toBe("Entity not found with id Environment")
    })

    it("Given a domain no environment declares, when the environment cannot be resolved, then the body names the domain and the project", async () => {
        const response = await app.inject({ method: "GET", url: "/no-environment" })

        expect(response.statusCode).toBe(404)
        expect(response.json().code).toBe("ENVIRONMENT_NOT_FOUND")
        expect(response.json().message).toContain("http://localhost:5173/")
        expect(response.json().message).toContain("project-1")
    })

    it("Given an unknown project, when the route throws, then the code tells it apart from a missing environment", async () => {
        const response = await app.inject({ method: "GET", url: "/no-project" })

        expect(response.statusCode).toBe(404)
        expect(response.json().code).toBe("PROJECT_NOT_FOUND")
    })

    it("Given a business exception, when the route throws, then its own status code is kept", async () => {
        const response = await app.inject({ method: "GET", url: "/business" })

        expect(response.statusCode).toBe(400)
        expect(response.json().error.code).toBe("NOPE")
    })

    it("Given an unexpected error, when the route throws, then the response is still a 500", async () => {
        const response = await app.inject({ method: "GET", url: "/boom" })

        expect(response.statusCode).toBe(500)
    })
})
