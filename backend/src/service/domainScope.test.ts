import { ObjectId, Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The deployment service opens transactions through this module, which reads the replica set flag at import time.
vi.mock("../plugins/noSQL", () => ({ isReplicaSet: false }))

import GithubClient from "../client/GithubClient"
import ApiKey from "../models/ApiKeyModel"
import CodeRepository, { CodeRepositoryProvider, CodeRepositoryType } from "../models/CodeRepositoryModel"
import Deployment from "../models/DeploymentModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import Domain from "../models/DomainModel"
import Environment from "../models/EnvironmentModel"
import GlobalVariable from "../models/GlobalVariableModel"
import Microfrontend, { MicrofrontendKind } from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import Service from "../models/ServiceModel"
import Storage from "../models/StorageModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { ConfigMap, Secret } from "../models/VariableMapModel"
import WizardProjectState from "../models/WizardProjectState"
import MicrofrontendDTO from "../types/MicrofrontendDTO"
import { ApiKeyService } from "./ApiKeyService"
import BaseAuthorizedService, { AuthorizedPrincipal, ensureOnlyNewRepositoryLinked } from "./BaseAuthorizedService"
import CodeRepositoryImportService from "./CodeRepositoryImportService"
import CodeRepositoryService from "./CodeRepositoryService"
import DeploymentCanaryUsersService from "./DeploymentCanaryUsersService"
import DeploymentService from "./DeploymentService"
import DomainService from "./DomainService"
import EnvironmentService from "./EnvironmentService"
import GitOpsService from "./GitOpsService"
import MarketService from "./MarketService"
import MicrofrontendService from "./MicrofrontendService"
import ProjectWizardService from "./ProjectWizardService"
import ServiceService from "./ServiceService"
import VariableMapService, { ensureAttachableMaps, mapIdsInScope } from "./VariableMapService"

/**
 * The id flavour the service signatures speak: mongoose's schema type, not the runtime one the driver
 * hands back. Spelled out once here so the tests read as scenarios instead of as casts.
 */
const newId = () => new Types.ObjectId() as unknown as ObjectId

const PROJECT_ID = newId()
const ORGANIZATION_ID = newId()
const OWN_DOMAIN = newId()
const OTHER_DOMAIN = newId()

/** Exposes the protected scope resolution: it is what every domain check below stands on. */
class ScopeProbe extends BaseAuthorizedService {
    scopeOf(projectId: ObjectId) {
        return this.getDomainScope(projectId)
    }
}

type Membership = { userId: ObjectId; projectId: ObjectId; role: RoleInProject; domainScoped?: boolean; domainIds?: ObjectId[] }

let memberships: Membership[]
let organizationAdmins: ObjectId[]

const sameId = (left: unknown, right: unknown) => String(left) === String(right)

/** A result that can be awaited, sessioned, sorted or leaned on, as the code under test does all of them. */
const queryResult = <T>(value: T) => ({
    session: () => queryResult(value),
    sort: () => queryResult(value),
    lean: () => Promise.resolve(value),
    then: (resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(value).then(resolve, reject)
})

const aUser = (): IUser => ({ _id: newId(), email: "someone@example.com" }) as unknown as IUser

/** A member of the project, confined to `domainIds` when given. */
const memberOf = (domainIds?: ObjectId[], role = RoleInProject.MEMBER): IUser => {
    const user = aUser()
    memberships.push({ userId: user._id, projectId: PROJECT_ID, role, domainScoped: domainIds !== undefined, domainIds: domainIds ?? [] })
    return user
}

/** The access to the project has tests of its own: here it is granted, so that only the domain scope decides. */
const grantProjectAccess = () => {
    vi.spyOn(BaseAuthorizedService.prototype as unknown as { ensureAccessToProject: () => Promise<void> }, "ensureAccessToProject").mockResolvedValue()
    vi.spyOn(BaseAuthorizedService.prototype as unknown as { ensureAccessToEnvironment: () => Promise<void> }, "ensureAccessToEnvironment").mockResolvedValue()
}

const refusedOutOfScope = { code: "DOMAIN_SCOPE_FORBIDDEN", statusCode: 403 }

beforeEach(() => {
    memberships = []
    organizationAdmins = []

    vi.spyOn(UserProject, "findOne").mockImplementation(((filter: Record<string, unknown>) =>
        queryResult(memberships.find(membership => sameId(membership.userId, filter.userId) && sameId(membership.projectId, filter.projectId)) ?? null)) as never)
    vi.spyOn(Project, "findOne").mockImplementation((() => queryResult({ _id: PROJECT_ID, organizationId: ORGANIZATION_ID })) as never)
    vi.spyOn(UserOrganization, "findOne").mockImplementation(((filter: Record<string, unknown>) =>
        queryResult(organizationAdmins.some(admin => sameId(admin, filter.userId)) ? { role: RoleInOrganization.ADMIN } : null)) as never)
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe("domain scope of a principal", () => {
    it("Given a member of the whole project, when the scope is resolved, then there is none", async () => {
        expect(await new ScopeProbe(memberOf()).scopeOf(PROJECT_ID)).toBeUndefined()
    })

    it("Given a member assigned to a domain, when the scope is resolved, then it is that domain", async () => {
        expect(await new ScopeProbe(memberOf([OWN_DOMAIN])).scopeOf(PROJECT_ID)).toEqual([String(OWN_DOMAIN)])
    })

    it("Given an organization administrator whose membership is scoped, when the scope is resolved, then they reach the whole project", async () => {
        const admin = memberOf([OWN_DOMAIN])
        organizationAdmins.push(admin._id)

        expect(await new ScopeProbe(admin).scopeOf(PROJECT_ID)).toBeUndefined()
    })

    it("Given a project API key, when the scope is resolved, then it reaches the whole project without any membership lookup", async () => {
        const apiKey: AuthorizedPrincipal = { ...aUser(), apiKeyId: String(newId()), restrictedToProjectIds: [String(PROJECT_ID)] } as AuthorizedPrincipal

        expect(await new ScopeProbe(apiKey).scopeOf(PROJECT_ID)).toBeUndefined()
        expect(UserProject.findOne).not.toHaveBeenCalled()
    })

    /** An MCP token or the assistant binds the principal to the project: the binding must not drop the domains. */
    it("Given a scoped member acting through a principal bound to the project, when the scope is resolved, then the domains still apply", async () => {
        const member = memberOf([OWN_DOMAIN])

        expect(await new ScopeProbe({ ...member, restrictedToProjectIds: [String(PROJECT_ID)] }).scopeOf(PROJECT_ID)).toEqual([String(OWN_DOMAIN)])
    })

    it("Given a scoped member whose every domain was deleted, when the scope is resolved, then it reaches nothing rather than the whole project", async () => {
        expect(await new ScopeProbe(memberOf([])).scopeOf(PROJECT_ID)).toEqual([])
    })

    it("Given the same service instance, when the scope is resolved twice, then the membership is read once", async () => {
        const probe = new ScopeProbe(memberOf([OWN_DOMAIN]))

        await probe.scopeOf(PROJECT_ID)
        await probe.scopeOf(PROJECT_ID)

        expect(UserProject.findOne).toHaveBeenCalledTimes(1)
    })

    it("Given a membership read that fails, when the same instance resolves the scope again, then it reads it again instead of replaying the failure", async () => {
        const probe = new ScopeProbe(memberOf([OWN_DOMAIN]))
        vi.mocked(UserProject.findOne).mockImplementationOnce((() => Promise.reject(new Error("connection lost"))) as never)

        await expect(probe.scopeOf(PROJECT_ID)).rejects.toThrow("connection lost")
        expect(await probe.scopeOf(PROJECT_ID)).toEqual([String(OWN_DOMAIN)])
    })

    it("Given an owner whose membership is somehow scoped, when the scope is resolved, then they reach the whole project", async () => {
        expect(await new ScopeProbe(memberOf([OWN_DOMAIN], RoleInProject.OWNER)).scopeOf(PROJECT_ID)).toBeUndefined()
    })
})

describe("microfrontends and services of a domain-scoped member", () => {
    const microfrontendIn = (domainId: ObjectId | null) => ({ _id: newId(), projectId: PROJECT_ID, slug: "cart", name: "Cart", domainId })

    beforeEach(grantProjectAccess)

    it.each([
        ["of their domain", OWN_DOMAIN, true],
        ["of another domain", OTHER_DOMAIN, false],
        ["in no domain", null, false]
    ])("Given a microfrontend %s, when a scoped member opens it, then it is reached only inside the scope", async (_case, domainId, reached) => {
        const microfrontend = microfrontendIn(domainId)
        vi.spyOn(Microfrontend, "findById").mockResolvedValue(microfrontend as never)

        const read = new MicrofrontendService(memberOf([OWN_DOMAIN])).getById(String(microfrontend._id))

        if (reached) {
            await expect(read).resolves.toBe(microfrontend)
        } else {
            await expect(read).rejects.toMatchObject(refusedOutOfScope)
        }
    })

    it("Given a scoped member, when the microfrontends are listed, then only those of their domains are read", async () => {
        const find = vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)

        await new MicrofrontendService(memberOf([OWN_DOMAIN])).getByProjectId(String(PROJECT_ID))

        expect(find).toHaveBeenCalledWith({ projectId: String(PROJECT_ID), domainId: { $in: [String(OWN_DOMAIN)] } })
    })

    it("Given a member of the whole project, when the microfrontends are listed, then every one is read", async () => {
        const find = vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)

        await new MicrofrontendService(memberOf()).getByProjectId(String(PROJECT_ID))

        expect(find).toHaveBeenCalledWith({ projectId: String(PROJECT_ID) })
    })

    it("Given a scoped member, when the services are listed, then only those of their domains are read", async () => {
        const find = vi.spyOn(Service, "find").mockImplementation((() => queryResult([])) as never)

        await new ServiceService(memberOf([OWN_DOMAIN])).getByProjectId(String(PROJECT_ID))

        expect(find).toHaveBeenCalledWith({ projectId: String(PROJECT_ID), domainId: { $in: [String(OWN_DOMAIN)] } })
    })

    it.each([
        ["another domain", String(OTHER_DOMAIN)],
        ["no domain", null]
    ])("Given a microfrontend of their domain, when a scoped member moves it to %s, then it is refused and nothing is written", async (_case, target) => {
        const microfrontend = microfrontendIn(OWN_DOMAIN)
        vi.spyOn(Microfrontend, "findById").mockResolvedValue(microfrontend as never)
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: OTHER_DOMAIN } as never)
        const write = vi.spyOn(Microfrontend, "findByIdAndUpdate")

        await expect(new MicrofrontendService(memberOf([OWN_DOMAIN])).update(String(microfrontend._id), { domainId: target } as MicrofrontendDTO)).rejects.toMatchObject(refusedOutOfScope)
        expect(write).not.toHaveBeenCalled()
    })

    it("Given a scoped member, when they create a microfrontend in no domain, then it is refused before anything is written", async () => {
        const write = vi.spyOn(Microfrontend, "create")

        await expect(new MicrofrontendService(memberOf([OWN_DOMAIN])).create({ name: "Cart", slug: "cart" } as MicrofrontendDTO, String(PROJECT_ID))).rejects.toMatchObject(refusedOutOfScope)
        expect(write).not.toHaveBeenCalled()
    })

    it("Given a host of another domain, when a scoped member creates a microfrontend of theirs as its remote, then it is refused before anything is written", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: OWN_DOMAIN } as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([{ _id: newId(), domainId: OTHER_DOMAIN }] as never)
        const write = vi.spyOn(Microfrontend, "create")

        const created = new MicrofrontendService(memberOf([OWN_DOMAIN])).create(
            { name: "Cart", slug: "cart", version: "1.0.0", domainId: String(OWN_DOMAIN), parentIds: [String(newId())] } as MicrofrontendDTO,
            String(PROJECT_ID)
        )

        await expect(created).rejects.toMatchObject(refusedOutOfScope)
        expect(write).not.toHaveBeenCalled()
    })

    it.each([
        ["a service of another domain it does not call yet", [], false],
        ["the services it already calls, one of another domain among them", ["linked"], true]
    ])("Given %s, when a scoped member saves their microfrontend with it, then it is written only when nothing new is out of their reach", async (_case, stored, written) => {
        const othersService = newId()
        const microfrontend = { ...microfrontendIn(OWN_DOMAIN), serviceIds: stored.map(() => othersService) }
        vi.spyOn(Microfrontend, "findById").mockResolvedValue(microfrontend as never)
        vi.spyOn(Service, "find").mockResolvedValue([{ _id: othersService, domainId: OTHER_DOMAIN }] as never)
        const write = vi.spyOn(Microfrontend, "findByIdAndUpdate").mockResolvedValue(microfrontend as never)

        const saved = new MicrofrontendService(memberOf([OWN_DOMAIN])).update(String(microfrontend._id), { serviceIds: [String(othersService)] } as unknown as MicrofrontendDTO)

        if (written) {
            await expect(saved).resolves.toBe(microfrontend)
        } else {
            await expect(saved).rejects.toMatchObject(refusedOutOfScope)
        }
        expect(write).toHaveBeenCalledTimes(written ? 1 : 0)
    })

    describe("code repository of a service", () => {
        const connectionId = newId()
        const link = { enabled: true, codeRepositoryId: String(connectionId), repositoryId: "42", name: "orders-be", cloneUrlHttps: "https://github.com/acme/orders-be.git" }
        const ownService = (codeRepository?: Record<string, unknown>) => ({ _id: newId(), projectId: PROJECT_ID, slug: "orders", name: "Orders", domainId: OWN_DOMAIN, codeRepository })

        beforeEach(() => {
            vi.spyOn(CodeRepository, "findById").mockResolvedValue({ _id: connectionId, projectId: PROJECT_ID } as never)
        })

        it("Given a service linked to a repository, when a scoped member saves it with the link unchanged, then it is written and the stored link stays as it is", async () => {
            // As the console form sends it back: without the provider data it does not show, keys in another order
            const service = ownService({ ...link, _id: newId(), repositoryData: { id: 42, default_branch: "main" }, gitlab: {} })
            vi.spyOn(Service, "findById").mockResolvedValue(service as never)
            const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)

            await new ServiceService(memberOf([OWN_DOMAIN])).update(String(service._id), {
                name: "Orders API",
                codeRepository: { cloneUrlSsh: "", name: link.name, cloneUrlHttps: link.cloneUrlHttps, repositoryId: link.repositoryId, codeRepositoryId: link.codeRepositoryId, enabled: true }
            } as never)

            expect(write).toHaveBeenCalledTimes(1)
            expect(write.mock.calls[0][1]).toEqual({ name: "Orders API" })
        })

        it.each([
            ["another repository id", { repositoryId: "43" }],
            ["only another name", { name: "catalog-fe" }],
            ["only another clone URL", { cloneUrlHttps: "https://github.com/acme/catalog-fe.git" }],
            ["provider data", { repositoryData: { id: 43 } }],
            ["another connection", { codeRepositoryId: String(newId()) }],
            ["a connection that is not an id", { codeRepositoryId: { $ne: null } }],
            ["the link disabled", { enabled: false }]
        ])("Given a service linked to a repository, when a scoped member saves it with %s, then it is refused and nothing is written", async (_case, change) => {
            const service = ownService(link)
            vi.spyOn(Service, "findById").mockResolvedValue(service as never)
            const write = vi.spyOn(Service, "findByIdAndUpdate")

            await expect(new ServiceService(memberOf([OWN_DOMAIN])).update(String(service._id), { codeRepository: { ...link, ...change } } as never)).rejects.toMatchObject(refusedOutOfScope)
            expect(write).not.toHaveBeenCalled()
        })

        it("Given a service with no repository, when a scoped member links it to one, then it is refused and nothing is written", async () => {
            const service = ownService()
            vi.spyOn(Service, "findById").mockResolvedValue(service as never)
            const write = vi.spyOn(Service, "findByIdAndUpdate")

            await expect(new ServiceService(memberOf([OWN_DOMAIN])).update(String(service._id), { codeRepository: link } as never)).rejects.toMatchObject(refusedOutOfScope)
            expect(write).not.toHaveBeenCalled()
        })

        it("Given a member of the whole project, when they link a service to another repository, then it is written", async () => {
            const service = ownService(link)
            vi.spyOn(Service, "findById").mockResolvedValue(service as never)
            const write = vi.spyOn(Service, "findByIdAndUpdate").mockResolvedValue(service as never)

            await new ServiceService(memberOf()).update(String(service._id), { codeRepository: { ...link, repositoryId: "43", name: "catalog-fe" } } as never)

            expect(write.mock.calls[0][1]).toMatchObject({ codeRepository: { repositoryId: "43", name: "catalog-fe" } })
        })

        it.each([
            ["an existing repository id", { repositoryId: "42" }],
            ["an existing repository name", { name: "catalog-fe" }],
            ["a clone URL", { cloneUrlHttps: "https://github.com/acme/catalog-fe.git" }],
            ["provider data", { repositoryData: { id: 42 } }],
            ["a GitLab path", { gitlab: { path: "acme/catalog-fe" } }],
            ["a new repository named as a dot-segment", { createData: { name: ".." } }],
            ["a new repository named as a path", { createData: { name: "x/../catalog-fe" } }],
            ["a name other than the new repository's", { name: "catalog-fe", createData: { name: "orders-be" } }],
            ["a new repository whose template is not a name", { createData: { name: "orders-be", template: { $ne: null } } }],
            ["a new repository whose visibility is not a flag", { createData: { name: "orders-be", private: "yes" } }]
        ])("Given a scoped member, when they create a service linked to %s, then it is refused before anything is written", async (_case, fields) => {
            vi.spyOn(Domain, "exists").mockResolvedValue({ _id: OWN_DOMAIN } as never)
            const write = vi.spyOn(Service, "create")

            const created = new ServiceService(memberOf([OWN_DOMAIN])).create(
                { name: "Orders", slug: "orders", domainId: String(OWN_DOMAIN), codeRepository: { enabled: true, codeRepositoryId: String(connectionId), ...fields } } as never,
                String(PROJECT_ID)
            )

            await expect(created).rejects.toMatchObject(refusedOutOfScope)
            expect(write).not.toHaveBeenCalled()
        })

        it("Given a disabled link the form left a stale new repository in, when a scoped member creates with it, then the link is let through: it creates nothing", () => {
            expect(() => ensureOnlyNewRepositoryLinked([String(OWN_DOMAIN)], { enabled: false, codeRepositoryId: String(connectionId), createData: { name: "..", private: "yes" } })).not.toThrow()
        })

        it("Given a disabled link naming an existing repository, when a scoped member creates with it, then it is refused", () => {
            expect(() => ensureOnlyNewRepositoryLinked([String(OWN_DOMAIN)], { enabled: false, name: "catalog-fe", createData: { name: "catalog-fe" } })).toThrow(
                expect.objectContaining(refusedOutOfScope)
            )
        })
    })

    describe("code repository of a microfrontend", () => {
        const link = { enabled: true, codeRepositoryId: String(newId()), repositoryId: "42", name: "cart-fe", cloneUrlHttps: "https://github.com/acme/cart-fe.git" }

        it("Given a microfrontend linked to a repository, when a scoped member saves it with the link unchanged, then the link is left out of the update", async () => {
            const microfrontend = { ...microfrontendIn(OWN_DOMAIN), codeRepository: link }
            vi.spyOn(Microfrontend, "findById").mockResolvedValue(microfrontend as never)
            const write = vi.spyOn(Microfrontend, "findByIdAndUpdate").mockResolvedValue(microfrontend as never)

            await new MicrofrontendService(memberOf([OWN_DOMAIN])).update(String(microfrontend._id), { name: "Cart page", codeRepository: { ...link } } as unknown as MicrofrontendDTO)

            expect(write).toHaveBeenCalledTimes(1)
            expect(write.mock.calls[0][1]).toEqual({ name: "Cart page" })
        })

        it("Given a microfrontend linked to a repository, when a scoped member saves it linked to another one, then it is refused and nothing is written", async () => {
            const microfrontend = { ...microfrontendIn(OWN_DOMAIN), codeRepository: link }
            vi.spyOn(Microfrontend, "findById").mockResolvedValue(microfrontend as never)
            const writes = [vi.spyOn(Microfrontend, "findByIdAndUpdate"), vi.spyOn(Microfrontend, "findOneAndUpdate")]

            const saved = new MicrofrontendService(memberOf([OWN_DOMAIN])).update(String(microfrontend._id), {
                codeRepository: { ...link, repositoryId: "43", name: "catalog-fe" }
            } as unknown as MicrofrontendDTO)

            await expect(saved).rejects.toMatchObject(refusedOutOfScope)
            for (const write of writes) expect(write).not.toHaveBeenCalled()
        })
    })
})

describe("repository created by a domain-scoped member", () => {
    const connectionId = newId()

    beforeEach(() => {
        grantProjectAccess()
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: OWN_DOMAIN } as never)
        vi.spyOn(Microfrontend, "exists").mockResolvedValue(null as never)
        vi.spyOn(Storage, "findOne").mockResolvedValue(null as never)
        vi.spyOn(CodeRepository, "findById").mockResolvedValue({
            _id: connectionId,
            projectId: PROJECT_ID,
            provider: CodeRepositoryProvider.GITHUB,
            accessToken: "token",
            githubData: { type: CodeRepositoryType.PERSONAL, userName: "ada" }
        } as never)
        vi.spyOn(GithubClient.prototype, "createRepository").mockResolvedValue({
            id: 42,
            name: "cart-fe",
            clone_url: "https://github.com/ada/cart-fe.git",
            ssh_url: "git@github.com:ada/cart-fe.git"
        } as never)
        vi.spyOn(GithubClient.prototype, "checkRepositorySecretExists").mockResolvedValue(false)
        vi.spyOn(GithubClient.prototype, "upsertRepositorySecret").mockResolvedValue()
        vi.spyOn(ApiKey.prototype, "save").mockImplementation(function (this: unknown) {
            return Promise.resolve(this) as never
        })
    })

    it.each([
        ["the console form", { repositoryId: "create_new", gitlab: { groupId: 7, groupPath: "acme" }, createData: { name: "cart-fe", private: false } }],
        ["the domain scaffold", { repositoryId: "", name: "cart-fe", createData: { name: "cart-fe", private: true, template: "vite-react" } }]
    ])("Given a microfrontend of their domain, when a scoped member creates it with a new repository from %s, then the deploy key is minted and the repository is linked", async (_case, fields) => {
        vi.spyOn(Microfrontend, "create").mockImplementation(((document: unknown) => Promise.resolve(document)) as never)
        vi.spyOn(MarketService.prototype, "getSingle").mockResolvedValue(null as never)

        const created = await new MicrofrontendService(memberOf([OWN_DOMAIN])).create(
            {
                name: "Cart",
                slug: "cart",
                version: "1.0.0",
                domainId: String(OWN_DOMAIN),
                codeRepository: { enabled: true, codeRepositoryId: String(connectionId), ...fields }
            } as MicrofrontendDTO,
            String(PROJECT_ID)
        )

        expect(ApiKey.prototype.save).toHaveBeenCalledTimes(1)
        expect(GithubClient.prototype.upsertRepositorySecret).toHaveBeenCalledWith(expect.objectContaining({ repositoryName: "cart-fe", value: expect.any(String) }))
        expect(created.codeRepository).toMatchObject({ repositoryId: "42", name: "cart-fe" })
    })

    it("Given a scoped member, when they ask for an API key directly, then it is refused: the key endpoints stay with the whole project", async () => {
        await expect(new ApiKeyService(memberOf([OWN_DOMAIN])).create(String(PROJECT_ID), { name: "mine" } as never)).rejects.toMatchObject(refusedOutOfScope)
        expect(ApiKey.prototype.save).not.toHaveBeenCalled()
    })
})

describe("project-level writes of a domain-scoped member", () => {
    beforeEach(grantProjectAccess)

    it("Given a scoped member, when they create an environment, then it is refused", async () => {
        await expect(new EnvironmentService(memberOf([OWN_DOMAIN])).create({ name: "Staging" } as never, String(PROJECT_ID))).rejects.toMatchObject(refusedOutOfScope)
    })

    it("Given a scoped member, when they create a domain, then it is refused before anything is written", async () => {
        const write = vi.spyOn(Domain, "create")

        await expect(new DomainService(memberOf([OWN_DOMAIN])).create({ name: "Payments" }, String(PROJECT_ID))).rejects.toMatchObject(refusedOutOfScope)
        expect(write).not.toHaveBeenCalled()
    })

    it("Given a scoped member, when they serve an older deployment again, then it is refused: it would roll back every domain", async () => {
        const environmentId = newId()
        const deployment = { _id: newId(), environmentId, save: vi.fn() }
        vi.spyOn(Deployment, "findById").mockResolvedValue(deployment as never)
        vi.spyOn(Environment, "findOne").mockImplementation((() => queryResult({ _id: environmentId, projectId: PROJECT_ID })) as never)

        await expect(new DeploymentService(memberOf([OWN_DOMAIN])).redeploy(String(deployment._id))).rejects.toMatchObject(refusedOutOfScope)
        expect(deployment.save).not.toHaveBeenCalled()
    })

    it("Given a scoped member, when they put a user on the canary of a deployment, then it is refused: the canary covers every domain", async () => {
        const environmentId = newId()
        vi.spyOn(Deployment, "findOne").mockImplementation((() => queryResult({ _id: newId(), environmentId })) as never)
        vi.spyOn(Deployment, "findById").mockResolvedValue({ environmentId } as never)
        vi.spyOn(Environment, "findOne").mockImplementation((() => queryResult({ _id: environmentId, projectId: PROJECT_ID })) as never)
        const write = vi.spyOn(DeploymentToCanaryUsers, "findOne")

        await expect(new DeploymentCanaryUsersService(memberOf([OWN_DOMAIN])).setCanaryUserWithPermissionCheck(String(newId()), "someone", true)).rejects.toMatchObject(refusedOutOfScope)
        expect(write).not.toHaveBeenCalled()
    })

    it("Given a scoped member, when they move the project setup wizard, then it is refused before anything is read", async () => {
        const read = vi.spyOn(WizardProjectState, "findOne")

        await expect(new ProjectWizardService(memberOf([OWN_DOMAIN])).persistState(String(PROJECT_ID), { stateValue: "DONE" })).rejects.toMatchObject(refusedOutOfScope)
        expect(read).not.toHaveBeenCalled()
    })

    it("Given repositories linked to microfrontends of several domains, when a scoped member lists the importable ones, then those of another domain are taken without saying by what", async () => {
        const cart = { _id: newId(), slug: "cart", name: "Cart", domainId: OWN_DOMAIN, codeRepository: { repositoryId: "1", name: "cart-fe" } }
        const catalog = { _id: newId(), slug: "catalog", name: "Catalog", domainId: OTHER_DOMAIN, codeRepository: { repositoryId: "2", name: "catalog-fe" } }
        vi.spyOn(CodeRepositoryService.prototype, "findById").mockResolvedValue({ _id: newId(), projectId: PROJECT_ID } as never)
        vi.spyOn(CodeRepositoryImportService.prototype, "fetchRepositories").mockResolvedValue([
            { repositoryId: "1", name: "cart-fe" },
            { repositoryId: "2", name: "catalog-fe" }
        ] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([cart, catalog] as never)
        vi.spyOn(Service, "find").mockResolvedValue([] as never)

        const repositories = await new CodeRepositoryImportService(memberOf([OWN_DOMAIN])).getImportableRepositories(String(newId()))

        expect(repositories.map(repository => ({ name: repository.name, alreadyImported: repository.alreadyImported, importedAs: repository.importedAs?.slug }))).toEqual([
            { name: "cart-fe", alreadyImported: true, importedAs: "cart" },
            { name: "catalog-fe", alreadyImported: true, importedAs: undefined }
        ])
        expect(repositories[1].slug).not.toBe("catalog")
    })
})

describe("deployment of a domain-scoped member", () => {
    const environmentId = newId()
    const own = { _id: newId(), slug: "cart", version: "2.0.0" }
    const othersServed = { _id: newId(), slug: "catalog", version: "1.0.0" }
    const ownServed = { _id: own._id, slug: "cart", version: "1.0.0" }
    const ownService = { _id: newId(), slug: "cart-be", version: "3.0.0", domainId: OWN_DOMAIN }
    let saved: Record<string, unknown> | undefined
    let readMicrofrontends: Record<string, unknown> | undefined
    let readServices: Record<string, unknown> | undefined

    beforeEach(() => {
        grantProjectAccess()
        saved = undefined
        readMicrofrontends = undefined
        readServices = undefined
        vi.spyOn(Environment, "findById").mockImplementation((() => queryResult({ _id: environmentId, projectId: PROJECT_ID })) as never)
        vi.spyOn(Microfrontend, "find").mockImplementation(((filter: Record<string, unknown>) => {
            readMicrofrontends = filter
            return queryResult([own])
        }) as never)
        vi.spyOn(Service, "find").mockImplementation(((filter: Record<string, unknown>) => {
            readServices = filter
            return queryResult([ownService])
        }) as never)
        vi.spyOn(GlobalVariable, "find").mockImplementation((() => queryResult([{ key: "API_URL", value: "unreleased" }])) as never)
        vi.spyOn(ConfigMap, "find").mockImplementation((() => queryResult([])) as never)
        vi.spyOn(Secret, "find").mockImplementation((() => queryResult([])) as never)
        vi.spyOn(Storage, "find").mockImplementation((() => queryResult([{ toObject: () => ({ name: "unreleased-bucket" }) }])) as never)
        vi.spyOn(Deployment, "find").mockImplementation((() => queryResult([])) as never)
        vi.spyOn(Deployment, "updateMany").mockResolvedValue({} as never)
        vi.spyOn(Deployment.prototype, "save").mockImplementation(function (this: { toObject: () => Record<string, unknown> }) {
            saved = this.toObject()
            return Promise.resolve(this) as never
        })
        vi.spyOn(DeploymentCanaryUsersService.prototype, "copyCanaryUsersRaw").mockResolvedValue(undefined as never)
    })

    /** What the saved snapshot serves, by slug and version: enough to tell a carried over microfrontend from a redeployed one */
    const served = () => ((saved?.microfrontends ?? []) as { slug: string; version: string }[]).map(microfrontend => `${microfrontend.slug}@${microfrontend.version}`)

    /** As mongoose's toObject: a copy of every item, the ids kept as ids */
    const copyOf = (document: Record<string, unknown>) => Object.fromEntries(Object.entries(document).map(([field, value]) => [field, Array.isArray(value) ? value.map(item => ({ ...item })) : value]))

    const serving = (current: Record<string, unknown> | null) =>
        vi.spyOn(Deployment, "findOne").mockImplementation((() => queryResult(current && { _id: newId(), ...current, toObject: () => copyOf(current) })) as never)

    it("Given an environment serving several domains, when a scoped member deploys, then only their microfrontends move and everything else stays as served", async () => {
        serving({ microfrontends: [ownServed, othersServed], variables: [{ key: "API_URL", value: "released" }], storages: [{ name: "released-bucket" }] })

        await new DeploymentService(memberOf([OWN_DOMAIN])).createRaw(String(environmentId))

        expect(readMicrofrontends).toEqual({ projectId: PROJECT_ID, domainId: { $in: [String(OWN_DOMAIN)] } })
        expect(served()).toEqual(["cart@2.0.0", "catalog@1.0.0"])
        expect(saved?.variables).toEqual([{ key: "API_URL", value: "released" }])
        expect(saved?.storages).toEqual([{ name: "released-bucket" }])
    })

    it("Given microfrontends of their domains added, deleted, or moved out of their reach since, when a scoped member deploys, then the new one ships, the deleted one goes and the moved one keeps its version", async () => {
        const added = { _id: newId(), slug: "reviews", version: "1.0.0" }
        const deleted = { _id: newId(), slug: "wishlist", version: "1.0.0", domainId: OWN_DOMAIN }
        const moved = { _id: newId(), slug: "search", version: "1.0.0", domainId: OWN_DOMAIN }
        // Moved by someone of the whole project to a domain out of the scope: it still exists, unlike the deleted one
        const lookedUp: unknown[][] = []
        vi.spyOn(Microfrontend, "find").mockImplementation(((filter: { _id?: { $in: unknown[] } }) => {
            if (!filter._id) return queryResult([own, added])
            lookedUp.push(filter._id.$in)
            return queryResult(filter._id.$in.filter(id => sameId(id, moved._id)).map(id => ({ _id: id })))
        }) as never)
        serving({ microfrontends: [ownServed, deleted, moved, othersServed], variables: [], storages: [] })

        await new DeploymentService(memberOf([OWN_DOMAIN])).createRaw(String(environmentId))

        expect(served()).toEqual(["cart@2.0.0", "search@1.0.0", "catalog@1.0.0", "reviews@1.0.0"])
        // One query for every missing one of their domains, none for another domain's
        expect(lookedUp).toEqual([[deleted._id, moved._id]])
    })

    it("Given an environment that serves nothing yet, when a scoped member deploys, then their microfrontends ship with the current variables and storages", async () => {
        serving(null)

        await new DeploymentService(memberOf([OWN_DOMAIN])).createRaw(String(environmentId))

        expect(served()).toEqual(["cart@2.0.0"])
        expect(saved?.variables).toEqual([{ key: "API_URL", value: "unreleased" }])
        expect(saved?.storages).toEqual([{ name: "unreleased-bucket" }])
    })

    it("Given a member of the whole project, when they deploy, then the snapshot is the project as it is now", async () => {
        serving({ microfrontends: [ownServed, othersServed], variables: [{ key: "API_URL", value: "released" }], storages: [{ name: "released-bucket" }] })

        await new DeploymentService(memberOf()).createRaw(String(environmentId))

        expect(readMicrofrontends).toEqual({ projectId: PROJECT_ID })
        expect(served()).toEqual(["cart@2.0.0"])
        expect(saved?.services).toEqual([ownService])
        expect(saved?.variables).toEqual([{ key: "API_URL", value: "unreleased" }])
    })

    it("Given config maps and secrets of the project, when a scoped member deploys, then the snapshot records the config maps with their values in the environment and the secrets by key only", async () => {
        const elsewhere = newId()
        const valueIn = (value: string) => ({ environmentId: environmentId, value })
        const valueElsewhere = { environmentId: elsewhere, value: "other" }
        const configMapId = newId()
        const secretId = newId()
        vi.spyOn(ConfigMap, "find").mockImplementation((() =>
            queryResult([
                {
                    _id: configMapId,
                    name: "cart",
                    entries: [
                        { key: "LOG_LEVEL", values: [valueIn("debug"), valueElsewhere] },
                        { key: "UNSET_HERE", values: [valueElsewhere] },
                        { key: "EMPTY", values: [valueIn("")] }
                    ]
                }
            ])) as never)
        vi.spyOn(Secret, "find").mockImplementation((() => queryResult([{ _id: secretId, name: "cart-db", entries: [{ key: "PASSWORD", values: [valueIn("s3cret")] }] }])) as never)
        serving(null)

        await new DeploymentService(memberOf([OWN_DOMAIN])).createRaw(String(environmentId))

        expect(saved?.configMaps).toEqual([{ _id: configMapId, name: "cart", entries: [{ key: "LOG_LEVEL", value: "debug" }] }])
        expect(saved?.secrets).toEqual([{ _id: secretId, name: "cart-db", entries: [{ key: "PASSWORD" }] }])
    })

    it("Given backends of several domains served, when a scoped member deploys, then only their backends move and the others' stay as served", async () => {
        const othersService = { _id: newId(), slug: "catalog-be", version: "1.0.0", domainId: OTHER_DOMAIN }
        serving({ microfrontends: [], services: [{ ...ownService, version: "2.0.0" }, othersService], variables: [], storages: [] })

        await new DeploymentService(memberOf([OWN_DOMAIN])).createRaw(String(environmentId))

        expect(readServices).toEqual({ projectId: PROJECT_ID, domainId: { $in: [String(OWN_DOMAIN)] } })
        expect(((saved?.services ?? []) as { slug: string; version: string }[]).map(service => `${service.slug}@${service.version}`)).toEqual(["cart-be@3.0.0", "catalog-be@1.0.0"])
    })

    describe("of one functional domain", () => {
        const domainsOfProject = (...domainIds: ObjectId[]) =>
            vi
                .spyOn(Domain, "exists")
                .mockImplementation(((filter: { _id: unknown; projectId: unknown }) =>
                    queryResult(sameId(filter.projectId, PROJECT_ID) && domainIds.some(id => sameId(id, filter._id)) ? { _id: filter._id } : null)) as never)

        it("Given a member of the whole project, when they deploy one domain, then only its microfrontends and services move and everything else stays as served", async () => {
            domainsOfProject(OWN_DOMAIN, OTHER_DOMAIN)
            serving({ microfrontends: [ownServed, othersServed], variables: [{ key: "API_URL", value: "released" }], storages: [{ name: "released-bucket" }] })

            await new DeploymentService(memberOf()).createRaw(String(environmentId), undefined, String(OWN_DOMAIN))

            expect(readMicrofrontends).toEqual({ projectId: PROJECT_ID, domainId: { $in: [String(OWN_DOMAIN)] } })
            expect(readServices).toEqual({ projectId: PROJECT_ID, domainId: { $in: [String(OWN_DOMAIN)] } })
            expect(served()).toEqual(["cart@2.0.0", "catalog@1.0.0"])
            expect(saved?.variables).toEqual([{ key: "API_URL", value: "released" }])
        })

        it("Given a scoped member, when they deploy a domain they are not assigned to, then it is refused", async () => {
            domainsOfProject(OWN_DOMAIN, OTHER_DOMAIN)
            serving(null)

            await expect(new DeploymentService(memberOf([OWN_DOMAIN])).createRaw(String(environmentId), undefined, String(OTHER_DOMAIN))).rejects.toMatchObject(refusedOutOfScope)
            expect(saved).toBeUndefined()
        })

        it("Given a domain of another project, when it is deployed, then it is not found and nothing is saved", async () => {
            domainsOfProject(OWN_DOMAIN)
            serving(null)

            await expect(new DeploymentService(memberOf()).createRaw(String(environmentId), undefined, String(newId()))).rejects.toMatchObject({ statusCode: 404 })
            expect(saved).toBeUndefined()
        })

        it("Given a scoped member deploying a domain they are not assigned to, when the deploy starts, then it is refused before GitOps pushes anything", async () => {
            domainsOfProject(OWN_DOMAIN, OTHER_DOMAIN)
            vi.spyOn(Environment, "find").mockImplementation((() => queryResult([{ _id: environmentId, projectId: PROJECT_ID }])) as never)
            const gitOpsDeploy = vi.spyOn(GitOpsService.prototype, "deploy")

            await expect(new DeploymentService(memberOf([OWN_DOMAIN])).createMultiple([String(environmentId)], String(OTHER_DOMAIN))).rejects.toMatchObject(refusedOutOfScope)
            expect(gitOpsDeploy).not.toHaveBeenCalled()
        })
    })
})

describe("config maps of a domain-scoped member", () => {
    const ownMap = newId()
    const sharedMap = newId()
    const unattachedMap = newId()

    beforeEach(() => {
        grantProjectAccess()
        // The own service attaches the own map and the shared one; a service of another domain attaches the shared one too
        vi.spyOn(Service, "find").mockResolvedValue([
            { domainId: OWN_DOMAIN, configMapIds: [ownMap, sharedMap] },
            { domainId: OTHER_DOMAIN, configMapIds: [sharedMap] }
        ] as never)
        vi.spyOn(Microfrontend, "find").mockResolvedValue([] as never)
    })

    it("Given a map of their service also attached to a FRONTEND of another domain, when the scope is applied, then it is out of it", async () => {
        vi.mocked(Microfrontend.find).mockResolvedValue([{ domainId: OTHER_DOMAIN, configMapIds: [ownMap] }] as never)

        expect(await mapIdsInScope("configMap", PROJECT_ID, [String(OWN_DOMAIN)])).toEqual(new Set())
    })

    it("Given a map shared with another domain, when a scoped member creates a FRONTEND attaching it, then it is refused before anything is written", async () => {
        vi.spyOn(Domain, "exists").mockResolvedValue({ _id: OWN_DOMAIN } as never)
        vi.spyOn(ConfigMap, "find").mockResolvedValue([{ _id: sharedMap, name: "shared", entries: [] }] as never)
        vi.spyOn(Secret, "find").mockResolvedValue([] as never)
        const write = vi.spyOn(Microfrontend, "create")

        const created = new MicrofrontendService(memberOf([OWN_DOMAIN])).create(
            { name: "Shop", slug: "shop", kind: MicrofrontendKind.FRONTEND, domainId: String(OWN_DOMAIN), configMapIds: [String(sharedMap)] } as MicrofrontendDTO,
            String(PROJECT_ID)
        )

        await expect(created).rejects.toMatchObject(refusedOutOfScope)
        expect(write).not.toHaveBeenCalled()
    })

    it("Given maps attached to services of several domains, when the scope is applied, then only those attached exclusively inside it are editable", async () => {
        expect(await mapIdsInScope("configMap", PROJECT_ID, [String(OWN_DOMAIN)])).toEqual(new Set([String(ownMap)]))
    })

    it.each([
        ["attached only to their services", ownMap, true],
        ["shared with another domain", sharedMap, false],
        ["attached to no service", unattachedMap, false]
    ])("Given a config map %s, when a scoped member opens it, then it is reached only when exclusively theirs", async (_case, mapId, reached) => {
        vi.spyOn(ConfigMap, "findById").mockResolvedValue({ _id: mapId, projectId: PROJECT_ID, name: "settings" } as never)

        const read = new VariableMapService("configMap", memberOf([OWN_DOMAIN])).getById(String(mapId))

        if (reached) {
            await expect(read).resolves.toMatchObject({ _id: mapId })
        } else {
            await expect(read).rejects.toMatchObject(refusedOutOfScope)
        }
    })

    it("Given a scoped member, when they create a config map, then it is refused: nothing attaches it yet", async () => {
        await expect(new VariableMapService("configMap", memberOf([OWN_DOMAIN])).create({ name: "settings", entries: [] } as never, String(PROJECT_ID))).rejects.toMatchObject(refusedOutOfScope)
    })

    /** The check of create and update of services and microfrontends, reached directly: the rest of an update has tests of its own. */
    const attach = async (user: IUser, configMapIds: ObjectId[], alreadyAttached: ObjectId[] = []) =>
        ensureAttachableMaps(await new ScopeProbe(user).scopeOf(PROJECT_ID), PROJECT_ID, { configMapIds: configMapIds.map(String) }, { configMapIds: alreadyAttached })

    it("Given a scoped member, when they attach a map shared with another domain to their service, then it is refused", async () => {
        await expect(attach(memberOf([OWN_DOMAIN]), [ownMap, sharedMap])).rejects.toMatchObject(refusedOutOfScope)
    })

    it("Given a map their service already attaches, when a scoped member saves the service, then it stays attached", async () => {
        await expect(attach(memberOf([OWN_DOMAIN]), [ownMap, sharedMap], [sharedMap])).resolves.toBeUndefined()
    })

    it("Given a member of the whole project, when they attach any map, then nothing is checked", async () => {
        await expect(attach(memberOf(), [unattachedMap])).resolves.toBeUndefined()
        expect(Service.find).not.toHaveBeenCalled()
    })
})
