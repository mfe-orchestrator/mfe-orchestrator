import { beforeEach, describe, expect, it, vi } from "vitest"
import UserCannotAccessThisEnvironmentError from "../../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisProjectError from "../../errors/UserCannotAccessThisProjectError"
import { McpSession, McpToolContext } from "../toolDefinition"
import { projectContentTools } from "./projectContentTools"

const createBulk = vi.fn()
const deleteMultiple = vi.fn()
const bulkDelete = vi.fn()
const setPosition = vi.fn()
const setDimension = vi.fn()
const getMicrofrontend = vi.fn()

// Hoisted with the mocks below, which build their service classes with it
const { principals, serviceClass } = vi.hoisted(() => {
    const principals: unknown[] = []
    const serviceClass = (methods: Record<string, unknown>) =>
        class {
            constructor(principal: unknown) {
                principals.push(principal)
                Object.assign(this, methods)
            }
        }
    return { principals, serviceClass }
})

vi.mock("../../service/EnvironmentService", () => ({
    default: serviceClass({ createBulk: (...args: unknown[]) => createBulk(...args), deleteMultiple: (...args: unknown[]) => deleteMultiple(...args) })
}))
vi.mock("../../service/MicrofrontendService", () => ({
    default: serviceClass({
        bulkDelete: (...args: unknown[]) => bulkDelete(...args),
        setPosition: (...args: unknown[]) => setPosition(...args),
        setDimension: (...args: unknown[]) => setDimension(...args),
        getById: (...args: unknown[]) => getMicrofrontend(...args)
    })
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const ENVIRONMENT = "bbbbbbbbbbbbbbbbbbbbbbbb"
const MICROFRONTEND = "cccccccccccccccccccccccc"

const tool = (name: string) => projectContentTools.find(candidate => candidate.name === name)!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "MEMBER" }],
        scopes: ["mfe:read", "mfe:write"],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

const run = (name: string, args: Record<string, unknown>) => tool(name).run(args as never, context())

describe("project content tools", () => {
    beforeEach(() => {
        for (const mock of [createBulk, deleteMultiple, bulkDelete, setPosition, setDimension, getMicrofrontend]) {
            mock.mockReset()
        }
        principals.length = 0
    })

    it("given their definitions, when read, then every one is console-only and the bulk deletes are destructive", () => {
        for (const definition of projectContentTools) {
            expect(definition.consoleOnly, definition.name).toBe(true)
        }
        const destructive = projectContentTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)
        expect(destructive.sort()).toEqual(["environments_delete_bulk", "microfrontends_delete_bulk"])
    })

    describe("environments_create_bulk", () => {
        it("given several environments, when created, then the service creates them in the project", async () => {
            const environments = [
                { name: "Staging", slug: "staging", color: "#f59e0b" },
                { name: "Production", slug: "production", color: "#22c55e", isProduction: true }
            ]
            createBulk.mockResolvedValue(environments)

            expect(await run("environments_create_bulk", { environments })).toEqual(environments)
            expect(createBulk).toHaveBeenCalledWith(environments, PROJECT)
            expect(principals[0]).toMatchObject({ restrictedToProjectIds: [PROJECT] })
        })

        it("given an environment with an invalid slug or an empty list, when the input is validated, then it is refused", () => {
            const schema = tool("environments_create_bulk").inputSchema

            expect(schema.safeParse({ environments: [] }).success).toBe(false)
            expect(schema.safeParse({ environments: [{ name: "Staging", slug: "Staging!", color: "#f59e0b" }] }).success).toBe(false)
        })
    })

    describe("environments_delete_bulk", () => {
        it("given environments of the project, when deleted, then the service deletes them all", async () => {
            expect(await run("environments_delete_bulk", { environmentIds: [ENVIRONMENT] })).toEqual({ deleted: 1 })
            expect(deleteMultiple).toHaveBeenCalledWith([ENVIRONMENT])
        })

        it("given an environment of another project, when deleted, then the refusal surfaces", async () => {
            deleteMultiple.mockRejectedValue(new UserCannotAccessThisEnvironmentError())

            await expect(run("environments_delete_bulk", { environmentIds: [ENVIRONMENT] })).rejects.toBeInstanceOf(UserCannotAccessThisEnvironmentError)
        })
    })

    describe("microfrontends_delete_bulk", () => {
        it("given microfrontends of the project, when deleted, then the count comes back", async () => {
            bulkDelete.mockResolvedValue(1)

            expect(await run("microfrontends_delete_bulk", { microfrontendIds: [MICROFRONTEND] })).toEqual({ deletedCount: 1 })
            expect(bulkDelete).toHaveBeenCalledWith([MICROFRONTEND])
        })

        it("given a microfrontend of another project, when deleted, then the refusal surfaces", async () => {
            bulkDelete.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("microfrontends_delete_bulk", { microfrontendIds: [MICROFRONTEND] })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("microfrontend_canvas_set", () => {
        it("given a position and a size, when set, then both are stored", async () => {
            setPosition.mockResolvedValue({ position: { x: 10, y: 20 } })
            setDimension.mockResolvedValue({ position: { x: 10, y: 20, width: 300, height: 200 } })

            const result = await run("microfrontend_canvas_set", { microfrontendId: MICROFRONTEND, position: { x: 10, y: 20 }, size: { width: 300, height: 200 } })

            expect(setPosition).toHaveBeenCalledWith(MICROFRONTEND, 10, 20)
            expect(setDimension).toHaveBeenCalledWith(MICROFRONTEND, 300, 200)
            expect(result).toEqual({ id: MICROFRONTEND, position: { x: 10, y: 20, width: 300, height: 200 } })
        })

        it("given neither a position nor a size, when set, then it is refused and nothing is stored", async () => {
            await expect(run("microfrontend_canvas_set", { microfrontendId: MICROFRONTEND })).rejects.toMatchObject({ code: "CANVAS_NOTHING_TO_SET" })
            expect(setPosition).not.toHaveBeenCalled()
            expect(setDimension).not.toHaveBeenCalled()
        })
    })
})
