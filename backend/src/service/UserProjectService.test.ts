import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mocked for the same reason as in the other service tests: the real module boots the application.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import Domain from "../models/DomainModel"
import Project from "../models/ProjectModel"
import User, { IUser, UserStatus } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import UserOrganizationService from "./UserOrganizationService"
import UserProjectService from "./UserProjectService"

/**
 * The id flavour the service signatures speak: mongoose's schema type, not the runtime one the driver
 * hands back. Spelled out once here so the tests read as scenarios instead of as casts.
 */
const newId = () => new Types.ObjectId() as unknown as ObjectId

const PROJECT_ID = newId()
const ORGANIZATION_ID = newId()

const aUser = (email: string): IUser => ({ _id: newId(), email }) as unknown as IUser

type ProjectMembership = {
    _id?: ObjectId
    userId: ObjectId
    projectId: ObjectId
    role: RoleInProject
    invitationToken?: string
    domainScoped?: boolean
    domainIds?: unknown[]
    save?: () => Promise<unknown>
}

let projectMemberships: ProjectMembership[]
let organizationMemberships: { userId: ObjectId; organizationId: ObjectId; role: RoleInOrganization }[]
let createdProjectMemberships: { userId: string; role: RoleInProject }[]
let deletedInvitations: number

const sameId = (left: unknown, right: unknown) => String(left) === String(right)

const thenable = <T>(value: T) => ({
    session: () => thenable(value),
    lean: () => Promise.resolve(value),
    then: (resolve: (value: T) => unknown) => resolve(value)
})

describe("UserProjectService", () => {
    beforeEach(() => {
        projectMemberships = []
        organizationMemberships = []
        createdProjectMemberships = []
        deletedInvitations = 1

        vi.spyOn(UserProject, "findOne").mockImplementation(((filter: Record<string, unknown>) => {
            const { userId, projectId, invitationToken } = filter as Record<string, unknown>
            return thenable(
                projectMemberships.find(
                    membership => sameId(membership.userId, userId) && sameId(membership.projectId, projectId) && (invitationToken === null ? !membership.invitationToken : true)
                ) ?? null
            )
        }) as never)

        vi.spyOn(UserProject, "deleteOne").mockImplementation((() => Promise.resolve({ deletedCount: deletedInvitations })) as never)

        vi.spyOn(UserProject.prototype, "save").mockImplementation(function (this: { userId: ObjectId; role: RoleInProject }) {
            createdProjectMemberships.push({ userId: String(this.userId), role: this.role })
            return Promise.resolve(this) as never
        })

        vi.spyOn(Project, "findOne").mockImplementation((() => thenable({ _id: PROJECT_ID, organizationId: ORGANIZATION_ID })) as never)
        vi.spyOn(Project, "findById").mockImplementation((() => thenable({ _id: PROJECT_ID, name: "Checkout", organizationId: ORGANIZATION_ID })) as never)

        vi.spyOn(UserOrganization, "findOne").mockImplementation(((filter: Record<string, unknown>) => {
            const { userId } = filter as Record<string, unknown>
            return thenable(organizationMemberships.find(membership => sameId(membership.userId, userId)) ?? null)
        }) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe("addUserToProjectByEmail", () => {
        /**
         * Without a membership there, the invitee would accept an invitation to a project sitting in a
         * tenant they do not belong to.
         */
        it("Given an existing user invited to a project, when the invitation is created, then they are let into the organization that owns it", async () => {
            const inviter = aUser("owner@example.com")
            const invitee = aUser("collega@example.com")
            projectMemberships.push({ userId: inviter._id, projectId: PROJECT_ID, role: RoleInProject.OWNER })
            vi.spyOn(User, "findOne").mockImplementation((() => thenable(invitee)) as never)
            const ensureMembership = vi.spyOn(UserOrganizationService.prototype, "ensureMembership").mockResolvedValue({} as never)

            await new UserProjectService(inviter).addUserToProjectByEmail(PROJECT_ID, invitee.email, RoleInProject.MEMBER)

            expect(ensureMembership).toHaveBeenCalledWith(invitee._id, ORGANIZATION_ID)
            expect(createdProjectMemberships).toEqual([{ userId: String(invitee._id), role: RoleInProject.MEMBER }])
        })

        it("Given someone with no access to the project, when they try to invite a collaborator, then it is refused", async () => {
            const stranger = aUser("stranger@example.com")
            vi.spyOn(User, "findOne").mockImplementation((() => thenable(aUser("collega@example.com"))) as never)
            const ensureMembership = vi.spyOn(UserOrganizationService.prototype, "ensureMembership").mockResolvedValue({} as never)

            await expect(new UserProjectService(stranger).addUserToProjectByEmail(PROJECT_ID, "collega@example.com", RoleInProject.MEMBER)).rejects.toThrow(/cannot access this project/i)
            expect(ensureMembership).not.toHaveBeenCalled()
            expect(createdProjectMemberships).toHaveLength(0)
        })
    })

    describe("declineMyInvitation", () => {
        /** The organization membership was a side effect of this invitation, so declining takes it back. */
        it("Given a declined project invitation, when it is dropped, then the membership it created in the organization is pruned", async () => {
            const invitee = aUser("collega@example.com")
            const prune = vi.spyOn(UserOrganizationService.prototype, "pruneImplicitMembership").mockResolvedValue(undefined)

            await new UserProjectService(invitee).declineMyInvitation(PROJECT_ID)

            expect(prune).toHaveBeenCalledWith(invitee._id, ORGANIZATION_ID)
        })

        it("Given no pending invitation, when one is declined, then nothing is pruned", async () => {
            const invitee = aUser("collega@example.com")
            deletedInvitations = 0
            const prune = vi.spyOn(UserOrganizationService.prototype, "pruneImplicitMembership").mockResolvedValue(undefined)

            await expect(new UserProjectService(invitee).declineMyInvitation(PROJECT_ID)).rejects.toThrow(/no pending invitation/i)
            expect(prune).not.toHaveBeenCalled()
        })
    })

    describe("member management", () => {
        let owner: IUser
        let member: IUser
        let viewer: IUser
        let invitedStatusById: Map<string, UserStatus>
        let deletedMembershipIds: string[]

        /** A membership row the service can change and save, as a mongoose document would be. */
        const joins = (user: IUser, role: RoleInProject, invitationToken?: string): ProjectMembership => {
            const membership: ProjectMembership = { _id: newId(), userId: user._id, projectId: PROJECT_ID, role, invitationToken }
            membership.save = () => Promise.resolve(membership)
            projectMemberships.push(membership)
            return membership
        }

        const roleOf = (user: IUser) => projectMemberships.find(membership => sameId(membership.userId, user._id))?.role

        beforeEach(() => {
            owner = aUser("owner@example.com")
            member = aUser("member@example.com")
            viewer = aUser("viewer@example.com")
            joins(owner, RoleInProject.OWNER)
            joins(member, RoleInProject.MEMBER)
            joins(viewer, RoleInProject.VIEWER)
            invitedStatusById = new Map()
            deletedMembershipIds = []

            vi.spyOn(User, "findById").mockImplementation(((id: unknown) => thenable({ _id: id, status: invitedStatusById.get(String(id)) ?? UserStatus.ACTIVE })) as never)
            vi.spyOn(UserProject, "countDocuments").mockImplementation(((filter: { userId: { $ne: unknown } }) =>
                Promise.resolve(
                    projectMemberships.filter(membership => membership.role === RoleInProject.OWNER && !membership.invitationToken && !sameId(membership.userId, filter.userId.$ne)).length
                )) as never)
            vi.spyOn(UserProject, "deleteOne").mockImplementation(((filter: { _id: unknown }) => {
                deletedMembershipIds.push(String(filter._id))
                return Promise.resolve({ deletedCount: 1 })
            }) as never)
        })

        it("Given a project owner, when they change a member's role, then the new role is saved", async () => {
            const saved = await new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.VIEWER)

            expect(saved.role).toBe(RoleInProject.VIEWER)
            expect(roleOf(member)).toBe(RoleInProject.VIEWER)
        })

        it("Given a project owner, when they remove a member, then the membership is deleted", async () => {
            const membership = projectMemberships.find(candidate => sameId(candidate.userId, member._id))!

            await new UserProjectService(owner).removeUserFromProject(PROJECT_ID, member._id)

            expect(deletedMembershipIds).toEqual([String(membership._id)])
        })

        /** The assistant runs its tools with a principal bound to the project: the organization role still counts there. */
        it("Given an organization administrator outside the project and bound to it, when they change a role, then it is allowed as for an owner", async () => {
            const admin = aUser("admin@example.com")
            organizationMemberships.push({ userId: admin._id, organizationId: ORGANIZATION_ID, role: RoleInOrganization.ADMIN })

            await new UserProjectService({ ...admin, restrictedToProjectIds: [String(PROJECT_ID)] }).updateUserRole(PROJECT_ID, member._id, RoleInProject.OWNER)

            expect(roleOf(member)).toBe(RoleInProject.OWNER)
        })

        it.each([
            ["MEMBER", () => member],
            ["VIEWER", () => viewer]
        ])("Given a %s, when they try to make themselves an owner, then it is refused and nothing changes", async (_role, actor) => {
            const before = roleOf(actor())

            await expect(new UserProjectService(actor()).updateUserRole(PROJECT_ID, actor()._id, RoleInProject.OWNER)).rejects.toMatchObject({
                code: "PROJECT_OWNER_REQUIRED",
                statusCode: 403
            })
            expect(roleOf(actor())).toBe(before)
        })

        it("Given a member, when they try to remove the owner, then it is refused and nothing is deleted", async () => {
            await expect(new UserProjectService(member).removeUserFromProject(PROJECT_ID, owner._id)).rejects.toMatchObject({ code: "PROJECT_OWNER_REQUIRED" })
            expect(deletedMembershipIds).toHaveLength(0)
        })

        /** An invitation hands out a role: a MEMBER could otherwise bring in an OWNER, or rewrite a pending invitation's role. */
        it("Given a member, when they invite somebody or resend an invitation, then it is refused before anything is written", async () => {
            const invited = aUser("invited@example.com")
            joins(invited, RoleInProject.VIEWER, "token")
            const ensureMembership = vi.spyOn(UserOrganizationService.prototype, "ensureMembership").mockResolvedValue({} as never)

            await expect(new UserProjectService(member).addUserToProjectByEmail(PROJECT_ID, "new@example.com", RoleInProject.OWNER)).rejects.toMatchObject({ code: "PROJECT_OWNER_REQUIRED" })
            await expect(new UserProjectService(member).addUserToProjectByEmail(PROJECT_ID, invited.email, RoleInProject.OWNER)).rejects.toMatchObject({ code: "PROJECT_OWNER_REQUIRED" })
            await expect(new UserProjectService(member).resendInvitation(PROJECT_ID, invited._id)).rejects.toMatchObject({ code: "PROJECT_OWNER_REQUIRED" })
            expect(ensureMembership).not.toHaveBeenCalled()
            expect(roleOf(invited)).toBe(RoleInProject.VIEWER)
            expect(createdProjectMemberships).toHaveLength(0)
        })

        it("Given an owner whose own owner invitation is still pending, when they change a role, then it is refused", async () => {
            const invited = aUser("invited@example.com")
            joins(invited, RoleInProject.OWNER, "pending-token")

            await expect(new UserProjectService(invited).updateUserRole(PROJECT_ID, member._id, RoleInProject.VIEWER)).rejects.toThrow(/cannot access this project/i)
        })

        it("Given someone outside the project, when they try to change a role or remove a member, then it is refused", async () => {
            const stranger = aUser("stranger@example.com")

            await expect(new UserProjectService(stranger).updateUserRole(PROJECT_ID, member._id, RoleInProject.OWNER)).rejects.toThrow(/cannot access this project/i)
            await expect(new UserProjectService(stranger).removeUserFromProject(PROJECT_ID, member._id)).rejects.toThrow(/cannot access this project/i)
            expect(roleOf(member)).toBe(RoleInProject.MEMBER)
            expect(deletedMembershipIds).toHaveLength(0)
        })

        it("Given the last owner, when they demote themselves, then it is refused", async () => {
            await expect(new UserProjectService(owner).updateUserRole(PROJECT_ID, owner._id, RoleInProject.MEMBER)).rejects.toMatchObject({ code: "PROJECT_LAST_OWNER", statusCode: 400 })
            expect(roleOf(owner)).toBe(RoleInProject.OWNER)
        })

        it("Given the last owner, when they are removed, then it is refused", async () => {
            await expect(new UserProjectService(owner).removeUserFromProject(PROJECT_ID, owner._id)).rejects.toMatchObject({ code: "PROJECT_LAST_OWNER" })
            expect(deletedMembershipIds).toHaveLength(0)
        })

        /** Until accepted, an invited owner owns nothing: they cannot stand in for the last real one. */
        it("Given another owner whose invitation is still pending, when the only accepted owner is demoted, then it is refused", async () => {
            joins(aUser("invited@example.com"), RoleInProject.OWNER, "pending-token")

            await expect(new UserProjectService(owner).updateUserRole(PROJECT_ID, owner._id, RoleInProject.VIEWER)).rejects.toMatchObject({ code: "PROJECT_LAST_OWNER" })
        })

        it("Given a second accepted owner, when the first one is demoted, then it is allowed", async () => {
            joins(aUser("second-owner@example.com"), RoleInProject.OWNER)

            await new UserProjectService(owner).updateUserRole(PROJECT_ID, owner._id, RoleInProject.MEMBER)

            expect(roleOf(owner)).toBe(RoleInProject.MEMBER)
        })

        it("Given a user who is not in the project, when their role is changed, then it is not found", async () => {
            await expect(new UserProjectService(owner).updateUserRole(PROJECT_ID, aUser("nobody@example.com")._id, RoleInProject.VIEWER)).rejects.toThrow(/not a member of this project/i)
        })

        /** An account that only existed to be invited would otherwise linger, attached to nothing. */
        it("Given a revoked invitation of a user who never signed up, when removed, then their organization membership and account are cleaned up", async () => {
            const invited = aUser("invited@example.com")
            joins(invited, RoleInProject.MEMBER, "pending-token")
            invitedStatusById.set(String(invited._id), UserStatus.INVITED)
            const prune = vi.spyOn(UserOrganizationService.prototype, "pruneImplicitMembership").mockResolvedValue(undefined)
            const dropAccount = vi.spyOn(UserOrganizationService.prototype, "deleteUserIfOnlyEverInvited").mockResolvedValue(undefined)

            await new UserProjectService(owner).removeUserFromProject(PROJECT_ID, invited._id)

            expect(prune).toHaveBeenCalledWith(invited._id, ORGANIZATION_ID)
            expect(dropAccount).toHaveBeenCalledTimes(1)
        })

        describe("domain scope", () => {
            const payments = newId()
            const shipping = newId()
            const ofAnotherProject = newId()

            const scopeOf = (user: IUser) => {
                const membership = projectMemberships.find(candidate => sameId(candidate.userId, user._id))!
                return { domainScoped: membership.domainScoped, domainIds: (membership.domainIds ?? []).map(String) }
            }

            beforeEach(() => {
                // The domains of the project: one of another project is not among them
                vi.spyOn(Domain, "find").mockImplementation(((filter: { _id: { $in: unknown[] } }) =>
                    thenable([payments, shipping].filter(id => filter._id.$in.some(candidate => sameId(candidate, id))).map(_id => ({ _id })))) as never)
                // The administrators of the organization, as the member list reads them
                vi.spyOn(UserOrganization, "find").mockImplementation(((filter: { organizationId: unknown; role: { $in: RoleInOrganization[] } }) =>
                    thenable(organizationMemberships.filter(membership => sameId(membership.organizationId, filter.organizationId) && filter.role.$in.includes(membership.role)))) as never)
            })

            it("Given an owner, when they invite a member to some domains, then the invitation is scoped to them", async () => {
                vi.spyOn(User, "findOne").mockImplementation((() => thenable(aUser("collega@example.com"))) as never)
                vi.spyOn(UserOrganizationService.prototype, "ensureMembership").mockResolvedValue({} as never)

                const invited = await new UserProjectService(owner).addUserToProjectByEmail(PROJECT_ID, "collega@example.com", RoleInProject.MEMBER, [String(payments), String(payments)])

                expect(invited).toMatchObject({ domainScoped: true })
                expect(invited?.domainIds?.map(String)).toEqual([String(payments)])
            })

            it("Given a domain of another project, when a member is invited to it, then it is refused before anyone is looked up", async () => {
                const findUser = vi.spyOn(User, "findOne")

                await expect(new UserProjectService(owner).addUserToProjectByEmail(PROJECT_ID, "collega@example.com", RoleInProject.MEMBER, [String(ofAnotherProject)])).rejects.toMatchObject({
                    code: "INVALID_DOMAIN",
                    statusCode: 400
                })
                expect(findUser).not.toHaveBeenCalled()
            })

            it("Given an owner invited to some domains, when the invitation is created, then it is refused: an owner manages the whole project", async () => {
                await expect(new UserProjectService(owner).addUserToProjectByEmail(PROJECT_ID, "collega@example.com", RoleInProject.OWNER, [String(payments)])).rejects.toMatchObject({
                    code: "DOMAIN_SCOPE_NOT_FOR_OWNER",
                    statusCode: 400
                })
            })

            it("Given domains in a role change, when it is saved, then they replace the scope", async () => {
                await new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.MEMBER, [String(shipping)])

                expect(scopeOf(member)).toEqual({ domainScoped: true, domainIds: [String(shipping)] })
            })

            it("Given an empty list in a role change, when it is saved, then the member reaches the whole project again", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, member._id))!, { domainScoped: true, domainIds: [payments] })

                await new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.VIEWER, [])

                expect(scopeOf(member)).toEqual({ domainScoped: false, domainIds: [] })
            })

            /** Deleting the last domain of a scope must not hand the whole project to the member on their next role change. */
            it("Given a scope emptied by deleted domains, when only the role changes, then the member stays confined to nothing", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, member._id))!, { domainScoped: true, domainIds: [] })

                await new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.VIEWER)

                expect(scopeOf(member)).toEqual({ domainScoped: true, domainIds: [] })
            })

            it("Given a scoped member, when they are made owner without opening the whole project to them, then it is refused", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, member._id))!, { domainScoped: true, domainIds: [payments] })

                await expect(new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.OWNER)).rejects.toMatchObject({ code: "DOMAIN_SCOPE_NOT_FOR_OWNER" })
                expect(roleOf(member)).toBe(RoleInProject.MEMBER)
            })

            it("Given a member whose every domain was deleted, when they are made owner without opening the whole project to them, then it is refused all the same", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, member._id))!, { domainScoped: true, domainIds: [] })

                await expect(new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.OWNER)).rejects.toMatchObject({ code: "DOMAIN_SCOPE_NOT_FOR_OWNER" })
                expect(scopeOf(member)).toEqual({ domainScoped: true, domainIds: [] })
            })

            it("Given a member whose every domain was deleted, when they are made owner with the whole project opened explicitly, then it is saved", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, member._id))!, { domainScoped: true, domainIds: [] })

                await new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.OWNER, [])

                expect(roleOf(member)).toBe(RoleInProject.OWNER)
                expect(scopeOf(member)).toEqual({ domainScoped: false, domainIds: [] })
            })

            it("Given an organization administrator whose membership is scoped, when the members are listed, then they are reported on the whole project", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, member._id))!, { domainScoped: true, domainIds: [payments] })
                organizationMemberships.push({ userId: member._id, organizationId: ORGANIZATION_ID, role: RoleInOrganization.ADMIN })
                vi.spyOn(UserProject, "find").mockImplementation((() => ({
                    populate: () => ({ lean: () => Promise.resolve(projectMemberships.map(membership => ({ ...membership, userId: { _id: membership.userId } }))) })
                })) as never)

                const users = await new UserProjectService(owner).getProjectUsers(PROJECT_ID)

                expect(users?.find(user => sameId(user._id, member._id))).toMatchObject({ domainScoped: false, domainIds: [] })
            })

            it("Given an owner whose membership is somehow scoped, when the members are listed, then they are reported on the whole project", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, owner._id))!, { domainScoped: true, domainIds: [payments] })
                vi.spyOn(UserProject, "find").mockImplementation((() => ({
                    populate: () => ({ lean: () => Promise.resolve(projectMemberships.map(membership => ({ ...membership, userId: { _id: membership.userId } }))) })
                })) as never)

                const users = await new UserProjectService(owner).getProjectUsers(PROJECT_ID)

                expect(users?.find(user => sameId(user._id, owner._id))).toMatchObject({ domainScoped: false, domainIds: [] })
            })

            it("Given an owner whose membership is somehow scoped, when they change a role, then it is refused: members are a whole-project decision", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, owner._id))!, { domainScoped: true, domainIds: [payments] })

                await expect(new UserProjectService(owner).updateUserRole(PROJECT_ID, member._id, RoleInProject.VIEWER)).rejects.toMatchObject({ code: "PROJECT_OWNER_REQUIRED" })
            })

            it("Given scoped and whole-project members, when the members are listed, then each carries its domains", async () => {
                Object.assign(projectMemberships.find(candidate => sameId(candidate.userId, member._id))!, { domainScoped: true, domainIds: [payments] })
                vi.spyOn(UserProject, "find").mockImplementation((() => ({
                    populate: () => ({ lean: () => Promise.resolve(projectMemberships.map(membership => ({ ...membership, userId: { _id: membership.userId } }))) })
                })) as never)

                const users = await new UserProjectService(owner).getProjectUsers(PROJECT_ID)

                expect(users?.map(user => ({ id: String(user._id), domainIds: user.domainIds }))).toEqual([
                    { id: String(owner._id), domainIds: [] },
                    { id: String(member._id), domainIds: [String(payments)] },
                    { id: String(viewer._id), domainIds: [] }
                ])
            })
        })
    })
})
