import Fastify, { FastifyInstance } from "fastify"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessException } from "../errors/BusinessException"
import errorHandler from "../plugins/errorHandler"
import aiModelController from "./AiModelController"

const list = vi.fn()
const create = vi.fn()
const update = vi.fn()
const remove = vi.fn()
const availableForOrganization = vi.fn()
const availableForProject = vi.fn()
const projectAccess = vi.fn()
const setProjectAccess = vi.fn()

vi.mock("../service/AiModelService", () => ({
    default: class {
        list = list
        create = create
        update = update
        delete = remove
        availableForOrganization = availableForOrganization
        availableForProject = availableForProject
        projectAccess = projectAccess
        setProjectAccess = setProjectAccess
    }
}))

const ORGANIZATION = "64b7f0c2a1b2c3d4e5f60719"
const PROJECT = "64b7f0c2a1b2c3d4e5f60718"
const AI = "64b7f0c2a1b2c3d4e5f60717"

describe("AiModelController", () => {
    let app: FastifyInstance

    beforeEach(async () => {
        for (const mock of [list, create, update, remove, availableForOrganization, availableForProject, projectAccess, setProjectAccess]) mock.mockReset().mockResolvedValue({})
        app = Fastify()
        app.decorate("config", {} as never)
        app.decorateRequest("databaseUser", null as never)
        app.addHook("onRequest", async request => {
            request.databaseUser = { _id: "user-1" } as never
        })
        await app.register(errorHandler)
        await app.register(aiModelController)
    })

    afterEach(async () => {
        await app.close()
    })

    it("Given a new AI, when it is posted, then it reaches the service and comes back as created", async () => {
        const body = { name: "Bedrock", provider: "aws-bedrock", model: "anthropic.claude-opus-5-5", config: { region: "eu-west-1", accessKeyId: "AKIA", secretAccessKey: "s" }, isDefault: true }

        const response = await app.inject({ method: "POST", url: `/organizations/${ORGANIZATION}/ai-models`, payload: body })

        expect(response.statusCode).toBe(201)
        expect(create).toHaveBeenCalledWith(ORGANIZATION, body)
    })

    it("Given a provider that does not exist, when an AI is posted, then it is rejected before the service", async () => {
        const response = await app.inject({ method: "POST", url: `/organizations/${ORGANIZATION}/ai-models`, payload: { name: "X", provider: "openai", config: {} } })

        expect(response.statusCode).toBe(400)
        expect(create).not.toHaveBeenCalled()
    })

    it("Given the whole form with a null maxEffort and model, when an AI is put, then the nulls reach the service to clear them", async () => {
        const body = { name: "Opus", provider: "anthropic", model: null, config: { apiKey: "••••••••••••" }, maxEffort: null, isDefault: false }

        const response = await app.inject({ method: "PUT", url: `/organizations/${ORGANIZATION}/ai-models/${AI}`, payload: body })

        expect(response.statusCode).toBe(200)
        expect(update).toHaveBeenCalledWith(ORGANIZATION, AI, body)
    })

    it("Given the system AI, when it is deleted, then the service's refusal comes back with its code", async () => {
        remove.mockRejectedValue(createBusinessException({ code: "AI_MODEL_SYSTEM_READONLY", message: "read-only", statusCode: 409 }))

        const response = await app.inject({ method: "DELETE", url: `/organizations/${ORGANIZATION}/ai-models/system` })

        expect(response.statusCode).toBe(409)
        expect(response.json().error.code).toBe("AI_MODEL_SYSTEM_READONLY")
    })

    it("Given an AI, when it is deleted, then the answer is empty", async () => {
        const response = await app.inject({ method: "DELETE", url: `/organizations/${ORGANIZATION}/ai-models/${AI}` })

        expect(response.statusCode).toBe(204)
        expect(remove).toHaveBeenCalledWith(ORGANIZATION, AI)
    })

    it("Given the organization's static routes, when they are read, then they do not fall on an AI id", async () => {
        await app.inject({ method: "GET", url: `/organizations/${ORGANIZATION}/ai-models` })
        await app.inject({ method: "GET", url: `/organizations/${ORGANIZATION}/ai-models/available` })
        await app.inject({ method: "GET", url: `/organizations/${ORGANIZATION}/ai-models/project-access` })

        expect(list).toHaveBeenCalledWith(ORGANIZATION)
        expect(availableForOrganization).toHaveBeenCalledWith(ORGANIZATION)
        expect(projectAccess).toHaveBeenCalledWith(ORGANIZATION)
    })

    it("Given a restriction or null, when a project's AIs are put, then they reach the service", async () => {
        await app.inject({ method: "PUT", url: `/projects/${PROJECT}/ai-models`, payload: { aiModelIds: [AI, "system"] } })
        await app.inject({ method: "PUT", url: `/projects/${PROJECT}/ai-models`, payload: { aiModelIds: null } })

        expect(setProjectAccess).toHaveBeenNthCalledWith(1, PROJECT, [AI, "system"])
        expect(setProjectAccess).toHaveBeenNthCalledWith(2, PROJECT, null)
    })

    it("Given the project header, when the available AIs are read, then they are the project's; without it the request is rejected", async () => {
        const withHeader = await app.inject({ method: "GET", url: "/ai-models/available", headers: { "project-id": PROJECT } })
        const without = await app.inject({ method: "GET", url: "/ai-models/available" })

        expect(withHeader.statusCode).toBe(200)
        expect(availableForProject).toHaveBeenCalledWith(PROJECT)
        expect(without.statusCode).toBeGreaterThanOrEqual(400)
        expect(availableForProject).toHaveBeenCalledTimes(1)
    })
})
