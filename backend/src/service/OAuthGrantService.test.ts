import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import OAuthGrant from "../models/OAuthGrantModel"
import Project from "../models/ProjectModel"
import UserOrganization from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { addProjectToGrant, authenticateGrant, MAX_PROJECTS_CREATED_PER_GRANT, projectCreationRefusal } from "./OAuthGrantService"

const USER = "aaaaaaaaaaaaaaaaaaaaaaaa"
const GRANT = "bbbbbbbbbbbbbbbbbbbbbbbb"
const SHARED = "cccccccccccccccccccccccc"
const CREATED = "dddddddddddddddddddddddd"
const ORGANIZATION = "eeeeeeeeeeeeeeeeeeeeeeee"

const grantWith = (fields: Record<string, unknown>) => ({
    _id: GRANT,
    userId: USER,
    clientId: "client-1",
    scopes: ["mfe:read", "mfe:write"],
    projectIds: [SHARED],
    expiresAt: new Date(Date.now() + 60_000),
    lastUsedAt: new Date(),
    ...fields
})

describe("OAuthGrantService", () => {
    let updateOne: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        updateOne = vi.spyOn(OAuthGrant, "updateOne").mockResolvedValue({ matchedCount: 1 } as never)
        vi.spyOn(Project, "findOne").mockResolvedValue({ organizationId: ORGANIZATION } as never)
        vi.spyOn(UserOrganization, "findOne").mockResolvedValue(null as never)
        vi.spyOn(UserProject, "findOne").mockResolvedValue({ role: RoleInProject.OWNER } as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe("authenticateGrant", () => {
        it("given a token minted before the client created a project, when it is used, then the created project is already reachable", async () => {
            vi.spyOn(OAuthGrant, "findById").mockResolvedValue(grantWith({ projectIds: [SHARED, CREATED], createdProjectIds: [CREATED] }) as never)

            const authenticated = await authenticateGrant({ grantId: GRANT, userId: USER, clientId: "client-1", projectIds: [SHARED] })

            expect(authenticated?.projects.map(project => project.projectId)).toEqual([SHARED, CREATED])
        })

        it("given a token naming only some projects, when it is used, then projects shared at consent but not in the token stay out", async () => {
            vi.spyOn(OAuthGrant, "findById").mockResolvedValue(grantWith({ projectIds: [SHARED, CREATED] }) as never)

            const authenticated = await authenticateGrant({ grantId: GRANT, userId: USER, clientId: "client-1", projectIds: [SHARED] })

            expect(authenticated?.projects.map(project => project.projectId)).toEqual([SHARED])
        })

        it("given a legacy single-project grant, when it is migrated, then the write only applies while the new shape is still empty", async () => {
            vi.spyOn(OAuthGrant, "findById").mockResolvedValue(grantWith({ projectIds: [], projectId: SHARED }) as never)

            await authenticateGrant({ grantId: GRANT, userId: USER, clientId: "client-1" })

            expect(updateOne.mock.calls[0][0]).toMatchObject({ _id: GRANT, $or: [{ projectIds: { $exists: false } }, { projectIds: { $size: 0 } }] })
        })
    })

    describe("projectCreationRefusal", () => {
        const refusalFor = (fields: Record<string, unknown>) => {
            vi.spyOn(OAuthGrant, "findById").mockResolvedValue(grantWith(fields) as never)
            return projectCreationRefusal(GRANT)
        }

        it("given a grant approved under the new consent wording, when asked, then creation is allowed", async () => {
            await expect(refusalFor({ canCreateProjects: true })).resolves.toBeUndefined()
        })

        it("given a grant approved before the wording mentioned project creation, when asked, then the user has to reconnect", async () => {
            await expect(refusalFor({})).resolves.toBe("reconsent")
        })

        it("given a grant that reached its cap, when asked, then creation is refused", async () => {
            await expect(refusalFor({ canCreateProjects: true, createdProjectIds: Array.from({ length: MAX_PROJECTS_CREATED_PER_GRANT }, () => CREATED) })).resolves.toBe("limit")
        })

        it("given a revoked grant, when asked, then it is inactive", async () => {
            await expect(refusalFor({ canCreateProjects: true, revokedAt: new Date() })).resolves.toBe("inactive")
        })
    })

    describe("addProjectToGrant", () => {
        it("given a live grant, when a created project is added, then it is shared and remembered as created, under the cap", async () => {
            await expect(addProjectToGrant(GRANT, CREATED)).resolves.toBe(true)

            const [filter, update] = updateOne.mock.calls[0]
            expect(filter).toMatchObject({ revokedAt: null, canCreateProjects: true, [`createdProjectIds.${MAX_PROJECTS_CREATED_PER_GRANT - 1}`]: { $exists: false } })
            expect(Object.keys((update as { $addToSet: object }).$addToSet)).toEqual(["projectIds", "createdProjectIds"])
        })

        it("given a grant revoked meanwhile, when a created project is added, then nothing is shared", async () => {
            updateOne.mockResolvedValue({ matchedCount: 0 } as never)

            await expect(addProjectToGrant(GRANT, CREATED)).resolves.toBe(false)
        })
    })
})
