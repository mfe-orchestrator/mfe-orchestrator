import { beforeEach, describe, expect, it, vi } from "vitest"
import UserCannotAccessThisOrganizationError from "../../errors/UserCannotAccessThisOrganizationError"
import { McpCredential, McpSession, McpToolContext } from "../toolDefinition"
import { organizationTools } from "./organizationTools"

const findProjects = vi.fn()
const findOrganizations = vi.fn()
const createProject = vi.fn()
const projectServicePrincipals: unknown[] = []
const addProjectToGrant = vi.fn()
const projectCreationRefusal = vi.fn()

vi.mock("../../models/ProjectModel", () => ({ default: { find: (...args: unknown[]) => ({ sort: () => findProjects(...args) }) } }))
vi.mock("../../models/OrganizationModel", () => ({ default: { find: (...args: unknown[]) => ({ sort: () => findOrganizations(...args) }) } }))
vi.mock("../..", () => ({ fastify: { log: { info: vi.fn() } } }))
vi.mock("../../service/OAuthGrantService", () => ({
    addProjectToGrant: (...args: unknown[]) => addProjectToGrant(...args),
    projectCreationRefusal: (...args: unknown[]) => projectCreationRefusal(...args)
}))
vi.mock("../../service/ProjectService", () => ({
    default: class {
        constructor(principal: unknown) {
            projectServicePrincipals.push(principal)
        }
        create = createProject
    }
}))

const SHARED_PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const VISIBLE_ORGANIZATION = "bbbbbbbbbbbbbbbbbbbbbbbb"
const OTHER_ORGANIZATION = "cccccccccccccccccccccccc"
const NEW_PROJECT = "dddddddddddddddddddddddd"

const projectCreate = organizationTools.find(tool => tool.name === "project_create")!

const contextWith = (credential: McpCredential): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com", restrictedToProjectIds: [SHARED_PROJECT] } as never,
        projects: [{ projectId: SHARED_PROJECT, role: "OWNER" }],
        scopes: ["mfe:read", "mfe:write"],
        credential
    }
    return { principal: session.principal, projectId: "", scopes: session.scopes, credential, session }
}

const OAUTH: McpCredential = { kind: "oauth", grantId: "grant-1", clientId: "client-1" }

describe("project_create", () => {
    beforeEach(() => {
        findProjects.mockReset().mockResolvedValue([{ _id: SHARED_PROJECT, name: "Portal", organizationId: VISIBLE_ORGANIZATION }])
        findOrganizations.mockReset().mockResolvedValue([{ _id: VISIBLE_ORGANIZATION, name: "Acme" }])
        createProject.mockReset().mockResolvedValue({ _id: NEW_PROJECT, name: "Checkout", slug: "checkout" })
        addProjectToGrant.mockReset().mockResolvedValue(true)
        projectCreationRefusal.mockReset().mockResolvedValue(undefined)
        projectServicePrincipals.length = 0
    })

    it("given an organization the connection reaches, when a project is created, then the user owns it and it joins the grant", async () => {
        const context = contextWith(OAUTH)

        const result = await projectCreate.run({ organizationId: VISIBLE_ORGANIZATION, name: "Checkout" } as never, context)

        expect(result).toEqual({ id: NEW_PROJECT, name: "Checkout", slug: "checkout", organizationId: VISIBLE_ORGANIZATION, role: "OWNER", sharedWithConnection: true })
        expect(createProject).toHaveBeenCalledWith({ organizationId: VISIBLE_ORGANIZATION, name: "Checkout", description: undefined }, "user-1")
        // The organization role is checked on the user, not on the project-bound principal
        expect(projectServicePrincipals[0]).not.toHaveProperty("restrictedToProjectIds")
        expect(addProjectToGrant).toHaveBeenCalledWith("grant-1", NEW_PROJECT)
        expect(context.session.projects).toContainEqual({ projectId: NEW_PROJECT, role: "OWNER" })
    })

    it("given an organization with no shared project, when a project is created there, then it is refused as not found and nothing is created", async () => {
        await expect(projectCreate.run({ organizationId: OTHER_ORGANIZATION, name: "Checkout" } as never, contextWith(OAUTH))).rejects.toThrow()

        expect(createProject).not.toHaveBeenCalled()
        expect(addProjectToGrant).not.toHaveBeenCalled()
    })

    it("given a project API key, when a project is created, then it is refused", async () => {
        await expect(projectCreate.run({ organizationId: VISIBLE_ORGANIZATION, name: "Checkout" } as never, contextWith({ kind: "api_key", apiKeyId: "key-1" }))).rejects.toMatchObject({
            code: "MCP_PROJECT_CREATE_NEEDS_USER"
        })
        expect(createProject).not.toHaveBeenCalled()
    })

    it("given a user who does not administer the organization, when a project is created, then the refusal surfaces and the grant is untouched", async () => {
        createProject.mockRejectedValue(new UserCannotAccessThisOrganizationError())

        await expect(projectCreate.run({ organizationId: VISIBLE_ORGANIZATION, name: "Checkout" } as never, contextWith(OAUTH))).rejects.toMatchObject({ code: "MCP_PROJECT_CREATE_NOT_ADMIN" })
        expect(addProjectToGrant).not.toHaveBeenCalled()
    })

    it("given a grant approved before creation was part of the consent, when a project is created, then nothing is created", async () => {
        projectCreationRefusal.mockResolvedValue("reconsent")

        await expect(projectCreate.run({ organizationId: VISIBLE_ORGANIZATION, name: "Checkout" } as never, contextWith(OAUTH))).rejects.toMatchObject({ code: "MCP_PROJECT_CREATE_REFUSED" })
        expect(createProject).not.toHaveBeenCalled()
    })

    it("given a grant revoked while the project was being created, when the call ends, then the project is reported as not shared", async () => {
        addProjectToGrant.mockResolvedValue(false)
        const context = contextWith(OAUTH)

        const result = await projectCreate.run({ organizationId: VISIBLE_ORGANIZATION, name: "Checkout" } as never, context)

        expect(result).toMatchObject({ id: NEW_PROJECT, sharedWithConnection: false })
        expect(context.session.projects.map(project => project.projectId)).not.toContain(NEW_PROJECT)
    })

    it("given its definition, when read, then it needs mfe:write and spans the shared projects", () => {
        expect(projectCreate.scope).toBe("mfe:write")
        expect(projectCreate.projectScoped).toBe(false)
        expect(projectCreate.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false })
    })
})
