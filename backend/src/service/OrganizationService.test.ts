import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mocked for the same reason as in the other service tests: the real module boots the application.
vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import { BusinessException } from "../errors/BusinessException"
import Organization from "../models/OrganizationModel"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import OrganizationService from "./OrganizationService"

/**
 * The id flavour the service signatures speak: mongoose's schema type, not the runtime one the driver
 * hands back. Spelled out once here so the tests read as scenarios instead of as casts.
 */
const newId = () => new Types.ObjectId() as unknown as ObjectId

const ORGANIZATION_ID = newId()

const aUser = (): IUser => ({ _id: newId(), email: "someone@example.com" }) as unknown as IUser

let memberships: { userId: ObjectId; role: RoleInOrganization; invitationToken?: string }[]
let projectCount: number
let createdOrganizations: { name: string; slug: string }[]
let createdMemberships: { userId: string; role: RoleInOrganization }[]
let deletedOrganizationIds: string[]
let deletedMembershipFilters: Record<string, unknown>[]

const sameId = (left: unknown, right: unknown) => String(left) === String(right)

const thenable = <T>(value: T) => ({
    session: () => thenable(value),
    lean: () => Promise.resolve(value),
    then: (resolve: (value: T) => unknown) => resolve(value)
})

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise
        return "no error"
    } catch (error) {
        return error instanceof BusinessException ? error.code : (error as Error).name
    }
}

describe("OrganizationService", () => {
    beforeEach(() => {
        memberships = []
        projectCount = 0
        createdOrganizations = []
        createdMemberships = []
        deletedOrganizationIds = []
        deletedMembershipFilters = []

        vi.spyOn(UserOrganization, "findOne").mockImplementation(((filter: Record<string, unknown>) => {
            const { userId, invitationToken } = filter as Record<string, unknown>
            return thenable(memberships.find(membership => sameId(membership.userId, userId) && (invitationToken === null ? !membership.invitationToken : true)) ?? null)
        }) as never)

        vi.spyOn(Project, "countDocuments").mockImplementation((() => Promise.resolve(projectCount)) as never)

        vi.spyOn(UserOrganization, "deleteMany").mockImplementation(((filter: Record<string, unknown>) => {
            deletedMembershipFilters.push(filter as Record<string, unknown>)
            return Promise.resolve({ deletedCount: memberships.length }) as never
        }) as never)

        vi.spyOn(Organization, "deleteOne").mockImplementation(((filter: Record<string, unknown>) => {
            deletedOrganizationIds.push(String((filter as { _id: unknown })._id))
            return Promise.resolve({ deletedCount: 1 }) as never
        }) as never)

        vi.spyOn(Organization.prototype, "save").mockImplementation(function (this: { name: string; slug: string }) {
            createdOrganizations.push({ name: this.name, slug: this.slug })
            return Promise.resolve(this) as never
        })

        vi.spyOn(UserOrganization.prototype, "save").mockImplementation(function (this: { userId: ObjectId; role: RoleInOrganization }) {
            createdMemberships.push({ userId: String(this.userId), role: this.role })
            return Promise.resolve(this) as never
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe("createRaw", () => {
        /** An organization with no owner could never be administered, and no other row grants that. */
        it("Given a name, when an organization is created, then whoever created it owns it", async () => {
            const creator = aUser()

            await new OrganizationService(creator).createRaw({ name: "Azimut Marketplace" }, creator._id)

            expect(createdOrganizations).toEqual([{ name: "Azimut Marketplace", slug: "azimut-marketplace" }])
            expect(createdMemberships).toEqual([{ userId: String(creator._id), role: RoleInOrganization.OWNER }])
        })

        it("Given a blank name, when an organization is created, then it is refused", async () => {
            const creator = aUser()

            expect(await codeOf(new OrganizationService(creator).createRaw({ name: "   " }, creator._id))).toBe("ORGANIZATION_NAME_REQUIRED")
            expect(createdOrganizations).toHaveLength(0)
        })
    })

    describe("update", () => {
        it("Given a plain member, when they try to rename the organization, then it is refused", async () => {
            const member = aUser()
            memberships.push({ userId: member._id, role: RoleInOrganization.MEMBER })

            expect(await codeOf(new OrganizationService(member).update(ORGANIZATION_ID, { name: "Nuovo nome" }))).toBe("UserCannotAccessThisOrganizationError")
        })
    })

    describe("delete", () => {
        it("Given an admin who does not own it, when they try to delete the organization, then it is refused", async () => {
            const admin = aUser()
            memberships.push({ userId: admin._id, role: RoleInOrganization.ADMIN })

            expect(await codeOf(new OrganizationService(admin).delete(ORGANIZATION_ID))).toBe("ORGANIZATION_OWNER_REQUIRED")
            expect(deletedOrganizationIds).toHaveLength(0)
        })

        /**
         * Deliberately not a cascade: an organization holds every project of a tenant, and wiping all of
         * them behind a single click is not something a confirmation dialog can make safe.
         */
        it("Given an organization that still holds projects, when its owner deletes it, then it is refused and nothing is removed", async () => {
            const owner = aUser()
            memberships.push({ userId: owner._id, role: RoleInOrganization.OWNER })
            projectCount = 3

            expect(await codeOf(new OrganizationService(owner).delete(ORGANIZATION_ID))).toBe("ORGANIZATION_NOT_EMPTY")
            expect(deletedOrganizationIds).toHaveLength(0)
            expect(deletedMembershipFilters).toHaveLength(0)
        })

        it("Given an empty organization, when its owner deletes it, then its memberships go with it", async () => {
            const owner = aUser()
            memberships.push({ userId: owner._id, role: RoleInOrganization.OWNER })

            await new OrganizationService(owner).delete(ORGANIZATION_ID)

            expect(deletedMembershipFilters).toEqual([{ organizationId: ORGANIZATION_ID }])
            expect(deletedOrganizationIds).toEqual([String(ORGANIZATION_ID)])
        })

        it("Given a pending owner invitation, when the invited user tries to delete the organization, then it is refused", async () => {
            const invited = aUser()
            memberships.push({ userId: invited._id, role: RoleInOrganization.OWNER, invitationToken: "pending" })

            expect(await codeOf(new OrganizationService(invited).delete(ORGANIZATION_ID))).toBe("ORGANIZATION_OWNER_REQUIRED")
        })
    })
})
