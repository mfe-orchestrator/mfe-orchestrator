import { beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessException } from "../../errors/BusinessException"
import UserCannotAccessThisOrganizationError from "../../errors/UserCannotAccessThisOrganizationError"
import { McpSession, McpToolContext } from "../toolDefinition"
import { organizationAdminTools } from "./organizationAdminTools"

const getSummary = vi.fn()
const updateOrganization = vi.fn()
const createOrganization = vi.fn()
const deleteOrganization = vi.fn()
const getOrganizationUsers = vi.fn()
const inviteToOrganization = vi.fn()
const updateRole = vi.fn()
const removeUser = vi.fn()

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

vi.mock("../../service/OrganizationService", () => ({
    default: serviceClass({
        getSummary: (...args: unknown[]) => getSummary(...args),
        update: (...args: unknown[]) => updateOrganization(...args),
        create: (...args: unknown[]) => createOrganization(...args),
        delete: (...args: unknown[]) => deleteOrganization(...args)
    })
}))
vi.mock("../../service/UserOrganizationService", () => ({
    default: serviceClass({
        getOrganizationUsers: (...args: unknown[]) => getOrganizationUsers(...args),
        addUserToOrganizationByEmail: (...args: unknown[]) => inviteToOrganization(...args),
        updateRole: (...args: unknown[]) => updateRole(...args),
        removeUser: (...args: unknown[]) => removeUser(...args)
    })
}))

const ORGANIZATION = "aaaaaaaaaaaaaaaaaaaaaaaa"
const MEMBER = "bbbbbbbbbbbbbbbbbbbbbbbb"

const tool = (name: string) => organizationAdminTools.find(candidate => candidate.name === name)!

/** Organization tools get the user's own principal, never one confined to a project. */
const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: "cccccccccccccccccccccccc", role: "MEMBER" }],
        scopes: ["mfe:read", "mfe:write"],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: session.principal, projectId: "", scopes: session.scopes, credential: session.credential, session }
}

const run = (name: string, args: Record<string, unknown> = {}) => tool(name).run(args as never, context())

const notAdmin = () => createBusinessException({ code: "ORGANIZATION_ADMIN_REQUIRED", message: "Only an owner or an admin can do this", statusCode: 403 })

describe("organization admin tools", () => {
    beforeEach(() => {
        for (const mock of [getSummary, updateOrganization, createOrganization, deleteOrganization, getOrganizationUsers, inviteToOrganization, updateRole, removeUser]) {
            mock.mockReset()
        }
        principals.length = 0
    })

    it("given their definitions, when read, then every one is console-only, spans organizations and removing access is destructive", () => {
        for (const definition of organizationAdminTools) {
            expect(definition.consoleOnly, definition.name).toBe(true)
            expect(definition.projectScoped, definition.name).toBe(false)
        }
        const destructive = organizationAdminTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)
        expect(destructive.sort()).toEqual(["organization_delete", "organization_member_remove", "organization_member_role_set"])
    })

    describe("organization_settings_get", () => {
        it("given an organization of the user, when read, then its summary is returned", async () => {
            getSummary.mockResolvedValue({ organization: { name: "Acme" }, role: "OWNER", count: { projects: 2, users: 3 } })

            expect(await run("organization_settings_get", { organizationId: ORGANIZATION })).toMatchObject({ role: "OWNER" })
            expect(getSummary).toHaveBeenCalledWith(ORGANIZATION)
            expect(principals[0]).not.toHaveProperty("restrictedToProjectIds")
        })

        it("given an organization the user is not in, when read, then the refusal surfaces", async () => {
            getSummary.mockRejectedValue(new UserCannotAccessThisOrganizationError())

            await expect(run("organization_settings_get", { organizationId: ORGANIZATION })).rejects.toBeInstanceOf(UserCannotAccessThisOrganizationError)
        })
    })

    describe("organization_update", () => {
        it("given new values, when updated, then the service gets the changes without the id", async () => {
            updateOrganization.mockResolvedValue({ name: "Acme Corp" })

            await run("organization_update", { organizationId: ORGANIZATION, name: "Acme Corp", description: null })

            expect(updateOrganization).toHaveBeenCalledWith(ORGANIZATION, { name: "Acme Corp", description: null })
        })

        it("given a member who does not administer it, when updated, then the refusal surfaces", async () => {
            updateOrganization.mockRejectedValue(notAdmin())

            await expect(run("organization_update", { organizationId: ORGANIZATION, name: "Acme Corp" })).rejects.toMatchObject({ code: "ORGANIZATION_ADMIN_REQUIRED" })
        })
    })

    describe("organization_create", () => {
        it("given a name, when created, then the user becomes its creator", async () => {
            createOrganization.mockResolvedValue({ _id: ORGANIZATION, name: "Acme" })

            expect(await run("organization_create", { name: "Acme" })).toEqual({ _id: ORGANIZATION, name: "Acme" })
            expect(createOrganization).toHaveBeenCalledWith({ name: "Acme" }, "user-1")
        })

        it("given a blank name, when the input is validated, then it is refused", () => {
            expect(tool("organization_create").inputSchema.safeParse({ name: "   " }).success).toBe(false)
        })
    })

    describe("organization_delete", () => {
        it("given an empty organization the user owns, when deleted, then the service deletes it", async () => {
            deleteOrganization.mockResolvedValue({ deletedCount: 1 })

            expect(await run("organization_delete", { organizationId: ORGANIZATION })).toEqual({ deleted: true, organizationId: ORGANIZATION })
            expect(deleteOrganization).toHaveBeenCalledWith(ORGANIZATION)
        })

        it("given an organization that still has projects, when deleted, then the refusal surfaces", async () => {
            deleteOrganization.mockRejectedValue(createBusinessException({ code: "ORGANIZATION_NOT_EMPTY", message: "The organization still contains projects: delete them first", statusCode: 409 }))

            await expect(run("organization_delete", { organizationId: ORGANIZATION })).rejects.toMatchObject({ code: "ORGANIZATION_NOT_EMPTY" })
        })
    })

    describe("organization_members_list", () => {
        it("given an organization, when its members are listed, then the service's list is returned", async () => {
            getOrganizationUsers.mockResolvedValue([{ _id: MEMBER, role: "MEMBER", projectCount: 1 }])

            expect(await run("organization_members_list", { organizationId: ORGANIZATION })).toEqual([{ _id: MEMBER, role: "MEMBER", projectCount: 1 }])
        })

        it("given an organization the user is not in, when listed, then the refusal surfaces", async () => {
            getOrganizationUsers.mockRejectedValue(new UserCannotAccessThisOrganizationError())

            await expect(run("organization_members_list", { organizationId: ORGANIZATION })).rejects.toBeInstanceOf(UserCannotAccessThisOrganizationError)
        })
    })

    describe("organization_member_invite", () => {
        it("given an email and a role, when invited, then the membership comes back without its invitation token", async () => {
            inviteToOrganization.mockResolvedValue({ userId: MEMBER, organizationId: ORGANIZATION, role: "ADMIN", invitationToken: "secret-token" })

            const result = await run("organization_member_invite", { organizationId: ORGANIZATION, email: "new@example.com", role: "ADMIN" })

            expect(inviteToOrganization).toHaveBeenCalledWith(ORGANIZATION, "new@example.com", "ADMIN")
            expect(result).toMatchObject({ userId: MEMBER, organizationId: ORGANIZATION, role: "ADMIN", invitationPending: true })
            expect(JSON.stringify(result)).not.toContain("secret-token")
        })

        it("given a member who does not administer the organization, when inviting, then the refusal surfaces", async () => {
            inviteToOrganization.mockRejectedValue(notAdmin())

            await expect(run("organization_member_invite", { organizationId: ORGANIZATION, email: "new@example.com", role: "MEMBER" })).rejects.toMatchObject({
                code: "ORGANIZATION_ADMIN_REQUIRED"
            })
        })
    })

    describe("organization_member_role_set", () => {
        it("given a member, when the role changes, then the updated membership is returned", async () => {
            updateRole.mockResolvedValue({ userId: MEMBER, organizationId: ORGANIZATION, role: "ADMIN" })

            expect(await run("organization_member_role_set", { organizationId: ORGANIZATION, userId: MEMBER, role: "ADMIN" })).toMatchObject({ role: "ADMIN", invitationPending: false })
            expect(updateRole).toHaveBeenCalledWith(ORGANIZATION, MEMBER, "ADMIN")
        })

        it("given an admin handing out ownership, when the role changes, then the refusal surfaces", async () => {
            updateRole.mockRejectedValue(createBusinessException({ code: "ORGANIZATION_OWNER_REQUIRED", message: "Only an owner can change who owns the organization", statusCode: 403 }))

            await expect(run("organization_member_role_set", { organizationId: ORGANIZATION, userId: MEMBER, role: "OWNER" })).rejects.toMatchObject({ code: "ORGANIZATION_OWNER_REQUIRED" })
        })
    })

    describe("organization_member_remove", () => {
        it("given a member, when removed, then the service removes them", async () => {
            expect(await run("organization_member_remove", { organizationId: ORGANIZATION, userId: MEMBER })).toEqual({ removed: true, organizationId: ORGANIZATION, userId: MEMBER })
            expect(removeUser).toHaveBeenCalledWith(ORGANIZATION, MEMBER)
        })

        it("given the last owner, when removed, then the refusal surfaces", async () => {
            removeUser.mockRejectedValue(createBusinessException({ code: "ORGANIZATION_LAST_OWNER", message: "Cannot remove the last owner of the organization." }))

            await expect(run("organization_member_remove", { organizationId: ORGANIZATION, userId: MEMBER })).rejects.toMatchObject({ code: "ORGANIZATION_LAST_OWNER" })
        })
    })
})
