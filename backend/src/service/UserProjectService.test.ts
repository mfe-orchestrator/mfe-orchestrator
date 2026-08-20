import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mocked for the same reason as in the other service tests: the real module boots the application.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import Project from "../models/ProjectModel"
import User, { IUser } from "../models/UserModel"
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

let projectMemberships: { userId: ObjectId; projectId: ObjectId; role: RoleInProject; invitationToken?: string }[]
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
})
