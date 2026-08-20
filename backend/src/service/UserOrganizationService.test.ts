import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mocked for the same reason as in the other service tests: the real module boots the application.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import { BusinessException } from "../errors/BusinessException"
import Project from "../models/ProjectModel"
import User, { IUser, UserStatus } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject from "../models/UserProjectModel"
import UserOrganizationService from "./UserOrganizationService"

/**
 * The id flavour the service signatures speak: mongoose's schema type, not the runtime one the driver
 * hands back. Spelled out once here so the tests read as scenarios instead of as casts.
 */
const newId = () => new Types.ObjectId() as unknown as ObjectId

interface FakeMembership {
    userId: ObjectId
    organizationId: ObjectId
    role: RoleInOrganization
    invitationToken?: string
    _id: ObjectId
    save: ReturnType<typeof vi.fn>
}

const ORGANIZATION_ID = newId()

const aUser = (): IUser => ({ _id: newId(), email: "someone@example.com" }) as unknown as IUser

let memberships: FakeMembership[]
let createdMemberships: { userId: string; organizationId: string; role: RoleInOrganization }[]
let deletedFilters: Record<string, unknown>[]
let projectsInOrganization: ObjectId[]
/** Projects of the organization the user is still attached to, whatever the invitation state. */
let remainingProjectMemberships: number
let storedUsers: { _id: ObjectId; status: UserStatus }[]
let deletedUserIds: string[]

const sameId = (left: unknown, right: unknown) => String(left) === String(right)

const aMembership = (userId: ObjectId, role: RoleInOrganization, invitationToken?: string): FakeMembership => {
    const membership = { _id: newId(), userId, organizationId: ORGANIZATION_ID, role, invitationToken, save: vi.fn() }
    membership.save.mockImplementation(() => Promise.resolve(membership))
    memberships.push(membership)
    return membership
}

const thenable = <T>(value: T) => ({
    sort: () => Promise.resolve(value),
    lean: () => Promise.resolve(value),
    session: () => thenable(value),
    then: (resolve: (value: T) => unknown) => resolve(value)
})

describe("UserOrganizationService", () => {
    beforeEach(() => {
        memberships = []
        createdMemberships = []
        deletedFilters = []
        projectsInOrganization = []
        remainingProjectMemberships = 0
        storedUsers = []
        deletedUserIds = []

        vi.spyOn(UserOrganization, "findOne").mockImplementation(((filter: Record<string, unknown>) => {
            const { userId, organizationId, invitationToken, role } = filter as Record<string, unknown>
            return thenable(
                memberships.find(
                    membership =>
                        sameId(membership.userId, userId) &&
                        (organizationId === undefined || sameId(membership.organizationId, organizationId)) &&
                        (role === undefined || membership.role === role) &&
                        (invitationToken === null ? !membership.invitationToken : true)
                ) ?? null
            )
        }) as never)

        vi.spyOn(UserOrganization, "countDocuments").mockImplementation(((filter: Record<string, unknown>) => {
            const { role, userId, invitationToken } = filter as Record<string, unknown>
            const excluded = (userId as { $ne?: unknown })?.$ne
            return Promise.resolve(
                memberships.filter(
                    membership =>
                        (role === undefined || membership.role === role) &&
                        (excluded === undefined || !sameId(membership.userId, excluded)) &&
                        (invitationToken === null ? !membership.invitationToken : true)
                ).length
            ) as never
        }) as never)

        vi.spyOn(UserOrganization, "deleteOne").mockImplementation(((filter: Record<string, unknown>) => {
            deletedFilters.push(filter as Record<string, unknown>)
            return Promise.resolve({ deletedCount: 1 }) as never
        }) as never)

        vi.spyOn(UserOrganization.prototype, "save").mockImplementation(function (this: {
            userId: ObjectId
            organizationId: ObjectId
            role: RoleInOrganization
        }) {
            createdMemberships.push({ userId: String(this.userId), organizationId: String(this.organizationId), role: this.role })
            return Promise.resolve(this) as never
        })

        vi.spyOn(Project, "find").mockImplementation((() => thenable(projectsInOrganization.map(_id => ({ _id })))) as never)
        vi.spyOn(UserProject, "countDocuments").mockImplementation((() => Promise.resolve(remainingProjectMemberships)) as never)
        vi.spyOn(UserProject, "deleteMany").mockImplementation((() => Promise.resolve({ deletedCount: remainingProjectMemberships })) as never)

        vi.spyOn(User, "findById").mockImplementation(((id: unknown) => thenable(storedUsers.find(user => sameId(user._id, id)) ?? null)) as never)
        vi.spyOn(User, "findByIdAndDelete").mockImplementation(((id: unknown) => {
            deletedUserIds.push(String(id))
            return thenable(null)
        }) as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe("ensureMembership", () => {
        /** A project invitation must never quietly demote somebody who already administers the organization. */
        it("Given a user who already administers the organization, when a membership is ensured, then the role they hold is kept", async () => {
            const user = aUser()
            aMembership(user._id, RoleInOrganization.ADMIN)

            const membership = await new UserOrganizationService().ensureMembership(user._id, ORGANIZATION_ID)

            expect(membership.role).toBe(RoleInOrganization.ADMIN)
            expect(createdMemberships).toHaveLength(0)
        })

        it("Given a user who does not belong to the organization, when a membership is ensured, then they are added as a plain member", async () => {
            const user = aUser()

            await new UserOrganizationService().ensureMembership(user._id, ORGANIZATION_ID)

            expect(createdMemberships).toEqual([{ userId: String(user._id), organizationId: String(ORGANIZATION_ID), role: RoleInOrganization.MEMBER }])
        })
    })

    describe("updateRole", () => {
        const codeOf = async (promise: Promise<unknown>) => {
            try {
                await promise
                return "no error"
            } catch (error) {
                return error instanceof BusinessException ? error.code : (error as Error).name
            }
        }

        /** An admin already administers everything else: ownership is the one thing that stays with the owners. */
        it("Given an admin, when they try to make somebody an owner, then it is refused", async () => {
            const admin = aUser()
            const target = aUser()
            aMembership(admin._id, RoleInOrganization.ADMIN)
            aMembership(target._id, RoleInOrganization.MEMBER)

            expect(await codeOf(new UserOrganizationService(admin).updateRole(ORGANIZATION_ID, target._id, RoleInOrganization.OWNER))).toBe("ORGANIZATION_OWNER_REQUIRED")
        })

        it("Given an admin, when they try to demote an owner, then it is refused", async () => {
            const admin = aUser()
            const owner = aUser()
            aMembership(admin._id, RoleInOrganization.ADMIN)
            aMembership(owner._id, RoleInOrganization.OWNER)

            expect(await codeOf(new UserOrganizationService(admin).updateRole(ORGANIZATION_ID, owner._id, RoleInOrganization.MEMBER))).toBe("ORGANIZATION_OWNER_REQUIRED")
        })

        it("Given an owner, when they promote a member to admin, then the new role is stored", async () => {
            const owner = aUser()
            const target = aUser()
            aMembership(owner._id, RoleInOrganization.OWNER)
            const membership = aMembership(target._id, RoleInOrganization.MEMBER)

            await new UserOrganizationService(owner).updateRole(ORGANIZATION_ID, target._id, RoleInOrganization.ADMIN)

            expect(membership.role).toBe(RoleInOrganization.ADMIN)
            expect(membership.save).toHaveBeenCalled()
        })

        /** An organization with no owner could not be administered by anybody, and nothing gives that back. */
        it("Given the only owner, when they try to demote themselves, then it is refused", async () => {
            const owner = aUser()
            aMembership(owner._id, RoleInOrganization.OWNER)

            expect(await codeOf(new UserOrganizationService(owner).updateRole(ORGANIZATION_ID, owner._id, RoleInOrganization.ADMIN))).toBe("ORGANIZATION_LAST_OWNER")
        })

        it("Given a second owner, when one of them is demoted, then the change goes through", async () => {
            const owner = aUser()
            const other = aUser()
            aMembership(owner._id, RoleInOrganization.OWNER)
            const membership = aMembership(other._id, RoleInOrganization.OWNER)

            await new UserOrganizationService(owner).updateRole(ORGANIZATION_ID, other._id, RoleInOrganization.MEMBER)

            expect(membership.role).toBe(RoleInOrganization.MEMBER)
        })
    })

    describe("removeUser", () => {
        it("Given the only owner, when they are removed, then it is refused", async () => {
            const owner = aUser()
            aMembership(owner._id, RoleInOrganization.OWNER)

            await expect(new UserOrganizationService(owner).removeUser(ORGANIZATION_ID, owner._id)).rejects.toThrow(/last owner/i)
        })

        /**
         * Leaving the project rows behind would keep granting access to data inside a tenant the user
         * no longer belongs to.
         */
        it("Given a member of some of its projects, when they are removed from the organization, then those project memberships go too", async () => {
            const owner = aUser()
            const member = aUser()
            aMembership(owner._id, RoleInOrganization.OWNER)
            aMembership(member._id, RoleInOrganization.MEMBER)
            projectsInOrganization = [newId(), newId()]
            remainingProjectMemberships = 2

            await new UserOrganizationService(owner).removeUser(ORGANIZATION_ID, member._id)

            expect(UserProject.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ userId: expect.anything(), projectId: { $in: projectsInOrganization } }))
            expect(deletedFilters).toHaveLength(1)
        })
    })

    describe("pruneImplicitMembership", () => {
        it("Given a user who still has a project in the organization, when the implicit membership is pruned, then it is kept", async () => {
            remainingProjectMemberships = 1

            await new UserOrganizationService().pruneImplicitMembership(newId(), ORGANIZATION_ID)

            expect(deletedFilters).toHaveLength(0)
        })

        /**
         * The filter is the guarantee: an owner, an admin or somebody holding an invitation of their own
         * was not put there by a project invitation, so pruning must not reach them.
         */
        it("Given a user with no project left, when the implicit membership is pruned, then only an accepted plain membership is dropped", async () => {
            const userId = newId()
            remainingProjectMemberships = 0

            await new UserOrganizationService().pruneImplicitMembership(userId, ORGANIZATION_ID)

            expect(deletedFilters).toEqual([{ userId, organizationId: ORGANIZATION_ID, role: RoleInOrganization.MEMBER, invitationToken: null }])
        })
    })

    describe("deleteUserIfOnlyEverInvited", () => {
        it("Given an account that only ever existed to be invited, when nothing points at it any more, then it is deleted", async () => {
            const userId = newId()
            storedUsers.push({ _id: userId, status: UserStatus.INVITED })
            remainingProjectMemberships = 0

            await new UserOrganizationService().deleteUserIfOnlyEverInvited(userId as never)

            expect(deletedUserIds).toEqual([String(userId)])
        })

        it("Given an account that has signed in before, when nothing points at it any more, then it is kept", async () => {
            const userId = newId()
            storedUsers.push({ _id: userId, status: UserStatus.ACTIVE })

            await new UserOrganizationService().deleteUserIfOnlyEverInvited(userId as never)

            expect(deletedUserIds).toEqual([])
        })

        it("Given an invited account that still belongs to an organization, when it is checked, then it is kept", async () => {
            const userId = newId()
            storedUsers.push({ _id: userId, status: UserStatus.INVITED })
            aMembership(userId, RoleInOrganization.MEMBER)

            await new UserOrganizationService().deleteUserIfOnlyEverInvited(userId as never)

            expect(deletedUserIds).toEqual([])
        })
    })
})
