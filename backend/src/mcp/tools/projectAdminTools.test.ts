import { beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessException } from "../../errors/BusinessException"
import UserCannotAccessThisProjectError from "../../errors/UserCannotAccessThisProjectError"
import { McpSession, McpToolContext } from "../toolDefinition"
import { projectAdminTools } from "./projectAdminTools"

const deleteProject = vi.fn()
const updateProject = vi.fn()
const getProjectUsers = vi.fn()
const addUserToProjectByEmail = vi.fn()
const resendInvitation = vi.fn()
const updateUserRole = vi.fn()
const removeUserFromProject = vi.fn()
const getApiKeys = vi.fn()
const createApiKey = vi.fn()
const setApiKeyStatus = vi.fn()
const listGrants = vi.fn()
const revokeGrant = vi.fn()
const mcpEnabled = vi.fn()

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

vi.mock("../../service/ProjectService", () => ({
    default: serviceClass({ delete: (...args: unknown[]) => deleteProject(...args), update: (...args: unknown[]) => updateProject(...args) })
}))
vi.mock("../../service/UserProjectService", () => ({
    default: serviceClass({
        getProjectUsers: (...args: unknown[]) => getProjectUsers(...args),
        addUserToProjectByEmail: (...args: unknown[]) => addUserToProjectByEmail(...args),
        resendInvitation: (...args: unknown[]) => resendInvitation(...args),
        updateUserRole: (...args: unknown[]) => updateUserRole(...args),
        removeUserFromProject: (...args: unknown[]) => removeUserFromProject(...args)
    })
}))
vi.mock("../../service/ApiKeyService", () => ({
    ApiKeyService: serviceClass({
        getByProjectId: (...args: unknown[]) => getApiKeys(...args),
        create: (...args: unknown[]) => createApiKey(...args),
        setStatus: (...args: unknown[]) => setApiKeyStatus(...args)
    })
}))
vi.mock("../../service/OAuthGrantService", () => ({
    default: serviceClass({ listForProject: (...args: unknown[]) => listGrants(...args), revoke: (...args: unknown[]) => revokeGrant(...args) })
}))
vi.mock("../../utils/oauthConfig", async importOriginal => ({
    ...(await importOriginal<typeof import("../../utils/oauthConfig")>()),
    getOAuthConfig: () => ({ enabled: mcpEnabled() })
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const MEMBER = "bbbbbbbbbbbbbbbbbbbbbbbb"
const DOMAIN = "ffffffffffffffffffffffff"
const API_KEY = "cccccccccccccccccccccccc"
const GRANT = "dddddddddddddddddddddddd"
const OTHER_GRANT = "eeeeeeeeeeeeeeeeeeeeeeee"

const tool = (name: string) => projectAdminTools.find(candidate => candidate.name === name)!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "OWNER" }],
        scopes: ["mfe:read", "mfe:write"],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

const run = (name: string, args: Record<string, unknown> = {}) => tool(name).run(args as never, context())

describe("project admin tools", () => {
    beforeEach(() => {
        for (const mock of [
            deleteProject,
            getProjectUsers,
            addUserToProjectByEmail,
            resendInvitation,
            updateUserRole,
            removeUserFromProject,
            getApiKeys,
            createApiKey,
            setApiKeyStatus,
            listGrants,
            revokeGrant,
            updateProject
        ]) {
            mock.mockReset()
        }
        mcpEnabled.mockReset().mockReturnValue(true)
        principals.length = 0
    })

    it("given their definitions, when read, then every one is console-only and the ones that delete or revoke are destructive", () => {
        for (const definition of projectAdminTools) {
            expect(definition.consoleOnly, definition.name).toBe(true)
        }
        const destructive = projectAdminTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)
        expect(destructive.sort()).toEqual(["api_key_revoke", "mcp_client_revoke", "project_delete", "project_member_remove", "project_member_role_set"])
    })

    describe("project_delete", () => {
        it("given the project of the console, when deleted, then the service deletes it with the project-bound principal", async () => {
            deleteProject.mockResolvedValue({ deletedCount: 1 })

            const result = await run("project_delete")

            expect(result).toEqual({ deleted: true, projectId: PROJECT })
            expect(deleteProject).toHaveBeenCalledWith(PROJECT)
            expect(principals[0]).toMatchObject({ restrictedToProjectIds: [PROJECT] })
        })

        it("given a user without access, when deleted, then the refusal surfaces", async () => {
            deleteProject.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("project_delete")).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("project_gitops_set", () => {
        it("given a repository, when switched on, then the project is updated with it and the setting comes back", async () => {
            const gitOps = { enabled: true, codeRepository: { codeRepositoryId: GRANT, repositoryId: "42", name: "config-be" } }
            updateProject.mockResolvedValue({ _id: PROJECT, gitOps })

            const result = await run("project_gitops_set", { enabled: true, codeRepositoryId: GRANT, repositoryId: "42" })

            expect(updateProject).toHaveBeenCalledWith(PROJECT, { gitOps: { enabled: true, codeRepositoryId: GRANT, repositoryId: "42" } })
            expect(result).toEqual({ gitOps })
        })

        it("given its definition, when read, then it is confirmed by the user and reaches outside", () => {
            expect(tool("project_gitops_set").requiresConfirmation).toBe(true)
            expect(tool("project_gitops_set").annotations).toMatchObject({ openWorldHint: true, destructiveHint: false })
        })

        it("given no repository, when switched on, then the input is refused, and switching off needs none", () => {
            const schema = tool("project_gitops_set").inputSchema

            expect(schema.safeParse({ enabled: true, codeRepositoryId: GRANT }).success).toBe(false)
            expect(schema.safeParse({ enabled: false }).success).toBe(true)
        })

        it("given a member who is not an owner, when switched, then the service's refusal surfaces", async () => {
            updateProject.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("project_gitops_set", { enabled: false })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("project_pipelines_set", () => {
        it("given a repository, when set, then the project is updated with it and the setting comes back", async () => {
            const pipelines = { codeRepository: { codeRepositoryId: GRANT, repositoryId: "7", name: "acme-pipelines" }, ref: "v2" }
            updateProject.mockResolvedValue({ _id: PROJECT, pipelines })

            const result = await run("project_pipelines_set", { codeRepositoryId: GRANT, repositoryId: "7", ref: "v2" })

            expect(updateProject).toHaveBeenCalledWith(PROJECT, { pipelines: { codeRepositoryId: GRANT, repositoryId: "7", ref: "v2" } })
            expect(result).toEqual({ pipelines })
        })

        it("given a null repository, when set, then the official templates are used again", async () => {
            // Mongoose hands back the nested path as an empty object once it is unset
            updateProject.mockResolvedValue({ _id: PROJECT, pipelines: {} })

            const result = await run("project_pipelines_set", { repositoryId: null })

            expect(updateProject).toHaveBeenCalledWith(PROJECT, { pipelines: null })
            expect(result).toEqual({ pipelines: null })
        })

        it("given its definition, when read, then it is confirmed by the user, and a repository needs its connection", () => {
            const schema = tool("project_pipelines_set").inputSchema

            expect(tool("project_pipelines_set").requiresConfirmation).toBe(true)
            expect(schema.safeParse({ repositoryId: "7" }).success).toBe(false)
            expect(schema.safeParse({ repositoryId: null }).success).toBe(true)
        })
    })

    describe("project_members_list", () => {
        it("given a project, when its members are listed, then the service's list is returned", async () => {
            getProjectUsers.mockResolvedValue([{ _id: MEMBER, email: "member@example.com", role: "MEMBER" }])

            expect(await run("project_members_list")).toEqual([{ _id: MEMBER, email: "member@example.com", role: "MEMBER" }])
            expect(getProjectUsers).toHaveBeenCalledWith(PROJECT)
        })

        it("given a user without access, when the members are listed, then the refusal surfaces", async () => {
            getProjectUsers.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("project_members_list")).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("project_member_invite", () => {
        it("given an email and a role, when invited, then the membership comes back without its invitation token", async () => {
            const expiresAt = new Date("2027-01-01T00:00:00Z")
            addUserToProjectByEmail.mockResolvedValue({ userId: MEMBER, projectId: PROJECT, role: "MEMBER", invitationToken: "secret-token", inviationTokenExpiresAt: expiresAt })

            const result = await run("project_member_invite", { email: "new@example.com", role: "MEMBER" })

            expect(addUserToProjectByEmail).toHaveBeenCalledWith(PROJECT, "new@example.com", "MEMBER", undefined)
            expect(result).toEqual({ userId: MEMBER, role: "MEMBER", domainIds: [], domainScoped: false, invitationPending: true, invitationExpiresAt: expiresAt })
            expect(JSON.stringify(result)).not.toContain("secret-token")
        })

        it("given domains, when invited, then the membership is confined to them and says so", async () => {
            addUserToProjectByEmail.mockResolvedValue({ userId: MEMBER, role: "MEMBER", domainScoped: true, domainIds: [{ toString: () => DOMAIN }] })

            const result = await run("project_member_invite", { email: "new@example.com", role: "MEMBER", domainIds: [DOMAIN] })

            expect(addUserToProjectByEmail).toHaveBeenCalledWith(PROJECT, "new@example.com", "MEMBER", [DOMAIN])
            expect(result).toMatchObject({ domainIds: [DOMAIN], domainScoped: true })
            expect(tool("project_member_invite").inputSchema.safeParse({ email: "new@example.com", role: "MEMBER", domainIds: ["not-an-id"] }).success).toBe(false)
        })

        it("given an invalid email or role, when the input is validated, then it is refused", () => {
            const schema = tool("project_member_invite").inputSchema

            expect(schema.safeParse({ email: "not-an-email", role: "MEMBER" }).success).toBe(false)
            expect(schema.safeParse({ email: "new@example.com", role: "ADMIN" }).success).toBe(false)
        })
    })

    describe("project_member_resend_invitation", () => {
        it("given a pending invitation, when resent, then the refreshed membership comes back without its token", async () => {
            resendInvitation.mockResolvedValue({ userId: MEMBER, role: "VIEWER", invitationToken: "fresh-token" })

            const result = await run("project_member_resend_invitation", { userId: MEMBER })

            expect(resendInvitation).toHaveBeenCalledWith(PROJECT, MEMBER)
            expect(result).toMatchObject({ userId: MEMBER, role: "VIEWER", invitationPending: true })
            expect(JSON.stringify(result)).not.toContain("fresh-token")
        })

        it("given an invitation already accepted, when resent, then the service's refusal surfaces", async () => {
            resendInvitation.mockRejectedValue(createBusinessException({ code: "INVITATION_ALREADY_ACCEPTED", message: "This user has already accepted the invitation" }))

            await expect(run("project_member_resend_invitation", { userId: MEMBER })).rejects.toMatchObject({ code: "INVITATION_ALREADY_ACCEPTED" })
        })
    })

    describe("project_member_role_set", () => {
        it("given no domains, when set, then the service keeps the stored scope and the view still says it is scoped", async () => {
            updateUserRole.mockResolvedValue({ userId: MEMBER, role: "VIEWER", domainScoped: true, domainIds: [] })

            const result = await run("project_member_role_set", { userId: MEMBER, role: "VIEWER" })

            expect(updateUserRole).toHaveBeenCalledWith(PROJECT, MEMBER, "VIEWER", undefined)
            expect(result).toMatchObject({ domainIds: [], domainScoped: true })
        })

        it("given domains, when set, then they replace the scope, an empty list opening the whole project", async () => {
            updateUserRole.mockResolvedValue({ userId: MEMBER, role: "MEMBER", domainScoped: false, domainIds: [] })

            const result = await run("project_member_role_set", { userId: MEMBER, role: "MEMBER", domainIds: [] })

            expect(updateUserRole).toHaveBeenCalledWith(PROJECT, MEMBER, "MEMBER", [])
            expect(result).toMatchObject({ domainIds: [], domainScoped: false })
        })

        it("given a member and a role, when set, then the service changes it with the project-bound principal and the token never comes back", async () => {
            updateUserRole.mockResolvedValue({ userId: MEMBER, role: "VIEWER", invitationToken: "secret-token" })

            const result = await run("project_member_role_set", { userId: MEMBER, role: "VIEWER" })

            expect(updateUserRole).toHaveBeenCalledWith(PROJECT, MEMBER, "VIEWER", undefined)
            expect(principals[0]).toMatchObject({ restrictedToProjectIds: [PROJECT] })
            expect(result).toMatchObject({ userId: MEMBER, role: "VIEWER", invitationPending: true })
            expect(JSON.stringify(result)).not.toContain("secret-token")
        })

        it("given a user who does not own the project, when a role is set, then the service's refusal surfaces", async () => {
            updateUserRole.mockRejectedValue(createBusinessException({ code: "PROJECT_OWNER_REQUIRED", message: "Only an owner of the project can change its members", statusCode: 403 }))

            await expect(run("project_member_role_set", { userId: MEMBER, role: "OWNER" })).rejects.toMatchObject({ code: "PROJECT_OWNER_REQUIRED" })
        })

        it("given a role the project does not have, when the input is validated, then it is refused", () => {
            expect(tool("project_member_role_set").inputSchema.safeParse({ userId: MEMBER, role: "ADMIN" }).success).toBe(false)
        })
    })

    describe("project_member_remove", () => {
        it("given a member, when removed, then the service removes them from the console's project", async () => {
            removeUserFromProject.mockResolvedValue(undefined)

            expect(await run("project_member_remove", { userId: MEMBER })).toEqual({ removed: true, userId: MEMBER })
            expect(removeUserFromProject).toHaveBeenCalledWith(PROJECT, MEMBER)
        })

        it("given the last owner, when removed, then the service's refusal surfaces", async () => {
            removeUserFromProject.mockRejectedValue(createBusinessException({ code: "PROJECT_LAST_OWNER", message: "Cannot remove the last owner of the project" }))

            await expect(run("project_member_remove", { userId: MEMBER })).rejects.toMatchObject({ code: "PROJECT_LAST_OWNER" })
        })
    })

    describe("api_keys_list", () => {
        it("given the project's keys, when listed, then each one is the frontend view without the hash", async () => {
            getApiKeys.mockResolvedValue([{ toFrontendObject: () => ({ name: "CI", role: "MANAGER", status: "ACTIVE" }) }])

            expect(await run("api_keys_list")).toEqual([{ name: "CI", role: "MANAGER", status: "ACTIVE" }])
            expect(getApiKeys).toHaveBeenCalledWith(PROJECT)
        })

        it("given a user without access, when listed, then the refusal surfaces", async () => {
            getApiKeys.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("api_keys_list")).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("api_key_create", () => {
        const created = { name: "CI", role: "MANAGER", status: "ACTIVE", expiresAt: new Date("2027-01-31T00:00:00Z"), apiKey: "plain-key-value", projectId: PROJECT }

        it("given a future expiry, when a key is created, then the service creates it and only the user's part of the result carries the key", async () => {
            createApiKey.mockResolvedValue(created)

            const result = await run("api_key_create", { name: "CI", expiresAt: "2027-01-31T00:00:00Z" })
            const { forModel, forUser } = tool("api_key_create").presentResult!(result)

            expect(createApiKey).toHaveBeenCalledWith(PROJECT, { name: "CI", role: undefined, expiresAt: new Date("2027-01-31T00:00:00Z") })
            expect(JSON.stringify(forModel)).not.toContain("plain-key-value")
            expect(forModel).toMatchObject({ name: "CI", role: "MANAGER", status: "ACTIVE" })
            expect(forUser).toMatchObject({ apiKey: "plain-key-value" })
        })

        it("given an expiry in the past, when a key is created, then it is refused and nothing is created", async () => {
            await expect(run("api_key_create", { name: "CI", expiresAt: "2020-01-01T00:00:00Z" })).rejects.toMatchObject({ code: "API_KEY_EXPIRY_IN_PAST" })
            expect(createApiKey).not.toHaveBeenCalled()
        })

        it("given an expiry that is not a date-time, when the input is validated, then it is refused", () => {
            expect(tool("api_key_create").inputSchema.safeParse({ name: "CI", expiresAt: "next year" }).success).toBe(false)
        })
    })

    describe("api_key_revoke", () => {
        it("given a key of the project, when revoked, then it is set inactive", async () => {
            setApiKeyStatus.mockResolvedValue({ name: "CI", status: "INACTIVE" })

            expect(await run("api_key_revoke", { apiKeyId: API_KEY })).toEqual({ id: API_KEY, name: "CI", status: "INACTIVE" })
            expect(setApiKeyStatus).toHaveBeenCalledWith(API_KEY, "INACTIVE")
        })

        it("given a key of another project, when revoked, then the refusal surfaces", async () => {
            setApiKeyStatus.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("api_key_revoke", { apiKeyId: API_KEY })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("mcp_clients_list", () => {
        it("given MCP enabled, when listed, then the project's connections are returned", async () => {
            listGrants.mockResolvedValue([{ id: GRANT, clientName: "Claude Code" }])

            expect(await run("mcp_clients_list")).toEqual([{ id: GRANT, clientName: "Claude Code" }])
            expect(listGrants).toHaveBeenCalledWith(PROJECT)
        })

        it("given MCP disabled, when listed, then it is refused", async () => {
            mcpEnabled.mockReturnValue(false)

            await expect(run("mcp_clients_list")).rejects.toMatchObject({ code: "MCP_DISABLED" })
            expect(listGrants).not.toHaveBeenCalled()
        })
    })

    describe("mcp_client_revoke", () => {
        it("given a connection the project lists, when revoked, then the service revokes it", async () => {
            listGrants.mockResolvedValue([{ id: GRANT }])

            expect(await run("mcp_client_revoke", { grantId: GRANT })).toEqual({ revoked: true, grantId: GRANT })
            expect(revokeGrant).toHaveBeenCalledWith(GRANT)
        })

        it("given a connection the project does not list, when revoked, then it is refused as not found and nothing is revoked", async () => {
            listGrants.mockResolvedValue([{ id: GRANT }])

            await expect(run("mcp_client_revoke", { grantId: OTHER_GRANT })).rejects.toThrow()
            expect(revokeGrant).not.toHaveBeenCalled()
        })
    })
})
