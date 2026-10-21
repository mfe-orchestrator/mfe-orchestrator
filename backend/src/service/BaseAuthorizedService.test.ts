import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import BaseAuthorizedService from "./BaseAuthorizedService"

/**
 * The id flavour the service signatures speak: mongoose's schema type, not the runtime one the driver
 * hands back. Spelled out once here so the tests read as scenarios instead of as casts.
 */
const newId = () => new Types.ObjectId() as unknown as ObjectId

/** Exposes the protected checks: they are the whole authorization surface of the application. */
class AccessProbe extends BaseAuthorizedService {
    canOpenProject(projectId: ObjectId) {
        return this.hasAccessToProject(projectId)
    }
    administers(organizationId: ObjectId) {
        return this.isOrganizationAdmin(organizationId)
    }
    belongsTo(organizationId: ObjectId) {
        return this.hasAccessToOrganization(organizationId)
    }
    administeredOrganizations() {
        return this.getAdministeredOrganizationIds()
    }
}

interface FakeProjectMembership {
    userId: ObjectId
    projectId: ObjectId
    role: RoleInProject
    invitationToken?: string
}

interface FakeOrganizationMembership {
    userId: ObjectId
    organizationId: ObjectId
    role: RoleInOrganization
    invitationToken?: string
}

const anOrganization = () => newId()
const aUser = (): IUser => ({ _id: newId(), email: "someone@example.com" }) as unknown as IUser

/** The principal a MCP access token resolves to: the same user, confined to one project. */
const boundTo = (user: IUser, ...projectIds: ObjectId[]) => ({ ...user, restrictedToProjectIds: projectIds.map(String) })

let projectMemberships: FakeProjectMembership[]
let organizationMemberships: FakeOrganizationMembership[]
let projects: { _id: ObjectId; organizationId: ObjectId }[]

const sameId = (left: unknown, right: unknown) => String(left) === String(right)

/**
 * `invitationToken: null` in a filter is how mongoose spells "not pending", and telling a pending row
 * from an accepted one is exactly what these tests are about — so the fakes have to honour it.
 */
const notPending = (row: { invitationToken?: string }, expected: unknown) => (expected === null ? !row.invitationToken : true)

/** A result that can be awaited, sessioned, or leaned on, as the code under test does all three. */
const queryResult = <T>(value: T) => ({
    session: () => queryResult(value),
    lean: () => Promise.resolve(value),
    then: (resolve: (value: T) => unknown) => resolve(value)
})

describe("access to a project and to an organization", () => {
    beforeEach(() => {
        projectMemberships = []
        organizationMemberships = []
        projects = []

        vi.spyOn(UserProject, "findOne").mockImplementation(((filter: Record<string, unknown>) => {
            const { userId, projectId, invitationToken } = filter as Record<string, unknown>
            return queryResult(projectMemberships.find(membership => sameId(membership.userId, userId) && sameId(membership.projectId, projectId) && notPending(membership, invitationToken)) ?? null)
        }) as never)

        vi.spyOn(Project, "findOne").mockImplementation(((filter: Record<string, unknown>) => {
            const { _id } = filter as Record<string, unknown>
            return queryResult(projects.find(project => sameId(project._id, _id)) ?? null)
        }) as never)

        const organizationRowsMatching = (filter: Record<string, unknown>) => {
            const { userId, organizationId, role, invitationToken } = filter
            const wantedRoles = (role as { $in?: RoleInOrganization[] })?.$in
            return organizationMemberships.filter(
                membership =>
                    sameId(membership.userId, userId) &&
                    (organizationId === undefined || sameId(membership.organizationId, organizationId)) &&
                    (wantedRoles === undefined || wantedRoles.includes(membership.role)) &&
                    notPending(membership, invitationToken)
            )
        }

        vi.spyOn(UserOrganization, "findOne").mockImplementation(((filter: Record<string, unknown>) => queryResult(organizationRowsMatching(filter as Record<string, unknown>)[0] ?? null)) as never)
        vi.spyOn(UserOrganization, "find").mockImplementation(((filter: Record<string, unknown>) => queryResult(organizationRowsMatching(filter as Record<string, unknown>))) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe("hasAccessToProject", () => {
        it("Given a member of the project, when access is checked, then it is granted", async () => {
            const user = aUser()
            const projectId = newId()
            projects.push({ _id: projectId, organizationId: anOrganization() })
            projectMemberships.push({ userId: user._id, projectId, role: RoleInProject.VIEWER })

            expect(await new AccessProbe(user).canOpenProject(projectId)).toBe(true)
        })

        /** An invitation is not a membership: the data must not be reachable before it is answered. */
        it("Given an invitation to the project that is still pending, when access is checked, then it is denied", async () => {
            const user = aUser()
            const projectId = newId()
            const organizationId = anOrganization()
            projects.push({ _id: projectId, organizationId })
            projectMemberships.push({ userId: user._id, projectId, role: RoleInProject.MEMBER, invitationToken: "pending" })
            organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.MEMBER })

            expect(await new AccessProbe(user).canOpenProject(projectId)).toBe(false)
        })

        it.each([RoleInOrganization.OWNER, RoleInOrganization.ADMIN])("Given a %s of the organization who is not a member of the project, when access is checked, then it is granted", async role => {
            const user = aUser()
            const projectId = newId()
            const organizationId = anOrganization()
            projects.push({ _id: projectId, organizationId })
            organizationMemberships.push({ userId: user._id, organizationId, role })

            expect(await new AccessProbe(user).canOpenProject(projectId)).toBe(true)
        })

        /** The whole point of keeping the organization role separate from the project role. */
        it("Given a plain member of the organization who was not invited to the project, when access is checked, then it is denied", async () => {
            const user = aUser()
            const projectId = newId()
            const organizationId = anOrganization()
            projects.push({ _id: projectId, organizationId })
            organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.MEMBER })

            expect(await new AccessProbe(user).canOpenProject(projectId)).toBe(false)
        })

        /** Being invited to administer an organization must not already grant what administering it grants. */
        it("Given an owner invitation to the organization that is still pending, when access is checked, then it is denied", async () => {
            const user = aUser()
            const projectId = newId()
            const organizationId = anOrganization()
            projects.push({ _id: projectId, organizationId })
            organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.OWNER, invitationToken: "pending" })

            expect(await new AccessProbe(user).canOpenProject(projectId)).toBe(false)
        })

        it("Given an owner of another organization, when access to a project of this one is checked, then it is denied", async () => {
            const user = aUser()
            const projectId = newId()
            projects.push({ _id: projectId, organizationId: anOrganization() })
            organizationMemberships.push({ userId: user._id, organizationId: anOrganization(), role: RoleInOrganization.OWNER })

            expect(await new AccessProbe(user).canOpenProject(projectId)).toBe(false)
        })

        it("Given no signed-in user, when access is checked, then it is denied", async () => {
            expect(await new AccessProbe().canOpenProject(newId())).toBe(false)
        })

        it("Given a project that does not exist, when access is checked, then it is denied", async () => {
            expect(await new AccessProbe(aUser()).canOpenProject(newId())).toBe(false)
        })
    })

    describe("a principal bound to one project", () => {
        it("Given a member of two projects bound to the first, when the second is checked, then it is denied", async () => {
            const user = aUser()
            const bound = newId()
            const other = newId()
            const organizationId = anOrganization()
            projects.push({ _id: bound, organizationId }, { _id: other, organizationId })
            projectMemberships.push({ userId: user._id, projectId: bound, role: RoleInProject.MEMBER }, { userId: user._id, projectId: other, role: RoleInProject.MEMBER })

            const probe = new AccessProbe(boundTo(user, bound))
            expect(await probe.canOpenProject(bound)).toBe(true)
            expect(await probe.canOpenProject(other)).toBe(false)
        })

        it("Given a member of three projects bound to two, when each is checked, then only the two are reached", async () => {
            const user = aUser()
            const organizationId = anOrganization()
            const [first, second, third] = [newId(), newId(), newId()]
            for (const projectId of [first, second, third]) {
                projects.push({ _id: projectId, organizationId })
                projectMemberships.push({ userId: user._id, projectId, role: RoleInProject.MEMBER })
            }

            const probe = new AccessProbe(boundTo(user, first, second))
            expect(await probe.canOpenProject(first)).toBe(true)
            expect(await probe.canOpenProject(second)).toBe(true)
            expect(await probe.canOpenProject(third)).toBe(false)
        })

        it("Given a principal bound to a project the user no longer belongs to, when it is checked, then the binding alone does not open it", async () => {
            const user = aUser()
            const projectId = newId()
            projects.push({ _id: projectId, organizationId: anOrganization() })

            expect(await new AccessProbe(boundTo(user, projectId)).canOpenProject(projectId)).toBe(false)
        })

        it("Given an organization owner bound to one of its projects, when that project is checked, then it is still reached through the organization", async () => {
            const user = aUser()
            const projectId = newId()
            const organizationId = anOrganization()
            projects.push({ _id: projectId, organizationId })
            organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.OWNER })

            expect(await new AccessProbe(boundTo(user, projectId)).canOpenProject(projectId)).toBe(true)
        })

        it("Given an organization owner bound to one project, when organization level access is checked, then it is denied", async () => {
            const user = aUser()
            const projectId = newId()
            const organizationId = anOrganization()
            projects.push({ _id: projectId, organizationId })
            organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.OWNER })

            const probe = new AccessProbe(boundTo(user, projectId))
            expect(await probe.belongsTo(organizationId)).toBe(false)
            expect(await probe.administers(organizationId)).toBe(false)
            expect(await probe.administeredOrganizations()).toEqual([])
        })
    })

    describe("a principal standing for a project API key", () => {
        /** As the MCP endpoint builds it: no user behind it, only the key's project. */
        const anApiKeyPrincipal = (projectId: ObjectId) => {
            const apiKeyId = newId()
            return { _id: apiKeyId, email: `api-key:${apiKeyId}`, apiKeyId: String(apiKeyId), restrictedToProjectIds: [String(projectId)] } as unknown as IUser
        }

        it("Given a key of a project, when that project is checked, then it is reached without any membership", async () => {
            const projectId = newId()
            projects.push({ _id: projectId, organizationId: anOrganization() })

            expect(await new AccessProbe(anApiKeyPrincipal(projectId)).canOpenProject(projectId)).toBe(true)
        })

        it("Given a key of a project, when another project of the same organization is checked, then it is denied", async () => {
            const organizationId = anOrganization()
            const own = newId()
            const other = newId()
            projects.push({ _id: own, organizationId }, { _id: other, organizationId })

            expect(await new AccessProbe(anApiKeyPrincipal(own)).canOpenProject(other)).toBe(false)
        })

        it("Given a key of a project, when organization level access is checked, then it is denied", async () => {
            const organizationId = anOrganization()
            const projectId = newId()
            projects.push({ _id: projectId, organizationId })

            const probe = new AccessProbe(anApiKeyPrincipal(projectId))
            expect(await probe.belongsTo(organizationId)).toBe(false)
            expect(await probe.administers(organizationId)).toBe(false)
            expect(await probe.administeredOrganizations()).toEqual([])
        })
    })

    describe("membership of an organization", () => {
        it("Given a plain member, when the organization is checked, then they belong to it but do not administer it", async () => {
            const user = aUser()
            const organizationId = anOrganization()
            organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.MEMBER })

            const probe = new AccessProbe(user)
            expect(await probe.belongsTo(organizationId)).toBe(true)
            expect(await probe.administers(organizationId)).toBe(false)
        })

        it("Given a pending invitation, when the organization is checked, then they do not belong to it yet", async () => {
            const user = aUser()
            const organizationId = anOrganization()
            organizationMemberships.push({ userId: user._id, organizationId, role: RoleInOrganization.MEMBER, invitationToken: "pending" })

            expect(await new AccessProbe(user).belongsTo(organizationId)).toBe(false)
        })

        it("Given organizations held with different roles, when the administered ones are listed, then only those they own or administer are returned", async () => {
            const user = aUser()
            const owned = anOrganization()
            const administered = anOrganization()
            const joined = anOrganization()
            const invited = anOrganization()
            const userId = user._id
            organizationMemberships.push(
                { userId, organizationId: owned, role: RoleInOrganization.OWNER },
                { userId, organizationId: administered, role: RoleInOrganization.ADMIN },
                { userId, organizationId: joined, role: RoleInOrganization.MEMBER },
                { userId, organizationId: invited, role: RoleInOrganization.OWNER, invitationToken: "pending" }
            )

            const administeredIds = (await new AccessProbe(user).administeredOrganizations()).map(String)

            expect(administeredIds).toEqual([String(owned), String(administered)])
        })
    })
})
