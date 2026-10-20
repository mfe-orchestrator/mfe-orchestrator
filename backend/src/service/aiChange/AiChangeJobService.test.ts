import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { log } = vi.hoisted(() => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock("../..", () => ({ fastify: { log, config: { REPOSITORIES_FOLDER: "/tmp/repos", REPOSITORIES_MAX_SIZE_MB: 500 } } }))

const workspaces = new Map<string, { target: unknown; workingCopy: Record<string, unknown>; defaultBranch: string }>()
const workspaceService = {
    open: vi.fn(async (component: { _id: unknown }) => workspaces.get(String(component._id))!),
    prepare: vi.fn(async () => "base-commit")
}
vi.mock("../workspace/RepositoryWorkspaceService", () => ({
    // A function, not an arrow: the service calls it with `new`.
    default: vi.fn(function RepositoryWorkspaceService() {
        return workspaceService
    })
}))

const { runAgent } = vi.hoisted(() => ({ runAgent: vi.fn() }))
vi.mock("./aiChangeAgent", async importOriginal => ({ ...(await importOriginal<typeof import("./aiChangeAgent")>()), runAiChangeAgent: runAgent }))

import AiChangeJob, { AiJobStatus } from "../../models/AiChangeJobModel"
import AiChangeRequest, { AiChangeStatus } from "../../models/AiChangeRequestModel"
import CodeRepository, { CodeRepositoryProvider } from "../../models/CodeRepositoryModel"
import Domain from "../../models/DomainModel"
import Microfrontend from "../../models/MicrofrontendModel"
import Project from "../../models/ProjectModel"
import Service from "../../models/ServiceModel"
import { IUser } from "../../models/UserModel"
import UserProject, { RoleInProject } from "../../models/UserProjectModel"
import BaseAuthorizedService from "../BaseAuthorizedService"
import { LlmClient } from "../llm"
import { RepositoryFileService } from "../RepositoryFileService"
import AiChangeJobService from "./AiChangeJobService"

type WithGates = { ensureAccessToProject: () => Promise<void>; isOrganizationAdmin: () => Promise<boolean> }
type WithProcess = { process: (jobId: string, client: LlmClient) => Promise<void> }
type WithApplyClaimed = { applyClaimed: (request: unknown, files: unknown, related: string[]) => Promise<{ pullRequestUrl?: string }> }

const user = { _id: new Types.ObjectId(), email: "ada@example.com", name: "Ada" } as unknown as IUser
const projectId = new Types.ObjectId().toString()

const microfrontend = (slug: string, name: string) => ({ _id: new Types.ObjectId(), projectId, slug, name, stack: { framework: "REACT" }, context: `${name} context` })
const catalog = microfrontend("catalog", "Catalog")
const cart = microfrontend("cart", "Cart")
const connectionId = new Types.ObjectId()
// Shares its slug with the catalog microfrontend: a service and a microfrontend may.
const catalogApi = {
    _id: new Types.ObjectId(),
    projectId,
    slug: "catalog",
    name: "Catalog API",
    stack: { runtime: "NODE", framework: "Express" },
    port: 3000,
    livenessPath: "/healthz/live",
    readinessPath: "/healthz/ready",
    docsPath: "/docs",
    env: [{ name: "DATABASE_URL", required: true, secret: true, description: "Postgres connection string" }],
    codeRepository: { enabled: true, codeRepositoryId: connectionId, name: "catalog-api" }
}

interface Update {
    model: string
    filter: Record<string, unknown>
    update: Record<string, unknown>
}

/** The progress lines pushed by the recorded updates, in order. */
const pushed = (updates: Update[]) => updates.flatMap(({ update }) => ((update.$push as { events?: { $each: { message: string }[] } } | undefined)?.events?.$each ?? []).map(entry => entry.message))

describe("AiChangeJobService", () => {
    let role: RoleInProject
    let microfrontends: ReturnType<typeof microfrontend>[]
    let withRepository: ReturnType<typeof microfrontend>[]
    let services: (typeof catalogApi)[]
    let activeJobs: number
    let updates: Update[]

    beforeEach(() => {
        role = RoleInProject.MEMBER
        microfrontends = [catalog, cart]
        withRepository = [catalog, cart]
        services = []
        activeJobs = 0
        updates = []
        const gates = BaseAuthorizedService.prototype as unknown as WithGates
        vi.spyOn(gates, "ensureAccessToProject").mockResolvedValue(undefined)
        vi.spyOn(gates, "isOrganizationAdmin").mockResolvedValue(false)
        vi.spyOn(UserProject, "findOne").mockImplementation((() => Promise.resolve({ role })) as never)
        vi.spyOn(Project, "findById").mockResolvedValue({ _id: projectId, organizationId: new Types.ObjectId(), name: "Shop", context: "Shop context" } as never)
        vi.spyOn(RepositoryFileService.prototype, "resolveTargets").mockImplementation(async () =>
            withRepository.map(candidate => ({ microfrontend: candidate, codeRepository: { projectId }, repositoryName: candidate.slug }) as never)
        )
        vi.spyOn(Microfrontend, "find").mockImplementation(((filter: { _id: { $in: unknown[] } }) =>
            Promise.resolve(microfrontends.filter(candidate => filter._id.$in.map(String).includes(String(candidate._id))))) as never)
        // By id for the components of a job, by project for the services a global job covers.
        vi.spyOn(Service, "find").mockImplementation(((filter: { _id?: { $in: unknown[] } }) =>
            Promise.resolve(filter._id ? services.filter(candidate => filter._id!.$in.map(String).includes(String(candidate._id))) : services)) as never)
        vi.spyOn(CodeRepository, "find").mockResolvedValue([{ _id: connectionId, projectId, provider: CodeRepositoryProvider.GITHUB }] as never)
        vi.spyOn(AiChangeJob, "exists").mockResolvedValue(null as never)
        vi.spyOn(AiChangeRequest, "exists").mockResolvedValue(null as never)
        vi.spyOn(AiChangeJob, "countDocuments").mockImplementation((() => Promise.resolve(activeJobs)) as never)
        vi.spyOn(AiChangeJob, "create").mockImplementation(((document: Record<string, unknown>) => Promise.resolve({ ...document, createdAt: new Date(), updatedAt: new Date() })) as never)
        vi.spyOn(AiChangeRequest, "create").mockImplementation(((document: Record<string, unknown>) => Promise.resolve({ _id: new Types.ObjectId(), files: [], ...document })) as never)
        for (const [model, target] of [
            ["job", AiChangeJob],
            ["request", AiChangeRequest]
        ] as const) {
            const record = (filter: Record<string, unknown>, update: Record<string, unknown>) => {
                updates.push({ model, filter, update })
                return Promise.resolve({ ...filter, ...update })
            }
            vi.spyOn(target as typeof AiChangeRequest, "updateOne").mockImplementation(record as never)
            vi.spyOn(target as typeof AiChangeRequest, "updateMany").mockImplementation(record as never)
            vi.spyOn(target as typeof AiChangeRequest, "findOneAndUpdate").mockImplementation(record as never)
        }
        for (const candidate of microfrontends) {
            workspaces.set(String(candidate._id), { target: {}, workingCopy: { dir: `/tmp/repos/${candidate.slug}` }, defaultBranch: "main" })
        }
        workspaces.set(String(catalogApi._id), { target: {}, workingCopy: { dir: "/tmp/repos/catalog.service" }, defaultBranch: "main" })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
        workspaces.clear()
    })

    const service = () => new AiChangeJobService(user, { ANTHROPIC_API_KEY: "sk-test" })

    describe("create", () => {
        beforeEach(() => {
            // The agent itself is covered below: here only what create decides.
            vi.spyOn(AiChangeJobService.prototype as unknown as WithProcess, "process").mockResolvedValue(undefined)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([] as never)
        })

        it("Given a viewer, when a job is started, then it is refused before anything is created", async () => {
            role = RoleInProject.VIEWER

            await expect(service().create(projectId, { prompt: "Rename the price API", scope: "global" })).rejects.toMatchObject({ code: "AI_CHANGE_FORBIDDEN", statusCode: 403 })
            expect(AiChangeJob.create).not.toHaveBeenCalled()
        })

        it("Given more than 10 microfrontends with a repository, when a global job is started, then it asks to select them", async () => {
            withRepository = Array.from({ length: 11 }, (_, index) => microfrontend(`mfe-${index}`, `Mfe ${index}`))

            await expect(service().create(projectId, { prompt: "Rename the price API", scope: "global" })).rejects.toMatchObject({ code: "AI_JOB_TOO_MANY_REPOSITORIES", statusCode: 422 })
            expect(AiChangeJob.create).not.toHaveBeenCalled()
        })

        it("Given 11 selected microfrontends, when the job is started, then it is refused", async () => {
            const ids = Array.from({ length: 11 }, () => new Types.ObjectId().toString())

            await expect(service().create(projectId, { prompt: "Rename the price API", scope: "selection", microfrontendIds: ids })).rejects.toMatchObject({ code: "AI_JOB_TOO_MANY_REPOSITORIES" })
        })

        it("Given no microfrontend with a repository, when a global job is started, then it is refused", async () => {
            withRepository = []

            await expect(service().create(projectId, { prompt: "Rename the price API", scope: "global" })).rejects.toMatchObject({ code: "AI_JOB_NO_REPOSITORIES", statusCode: 422 })
        })

        it("Given a selected microfrontend without a repository, when the job is started, then it is refused naming it", async () => {
            withRepository = [catalog]

            await expect(service().create(projectId, { prompt: "Rename the price API", scope: "selection", microfrontendIds: [String(catalog._id), String(cart._id)] })).rejects.toMatchObject({
                code: "AI_JOB_NO_REPOSITORIES",
                message: expect.stringContaining("Cart")
            })
        })

        it("Given 3 jobs already running in the project, when another is started, then it is refused", async () => {
            activeJobs = 3

            await expect(service().create(projectId, { prompt: "Rename the price API", scope: "global" })).rejects.toMatchObject({ code: "AI_CHANGE_TOO_MANY", statusCode: 429 })
        })

        it("Given two selected microfrontends, when the job is started, then it is its own root and each repository gets a pending request on its default branch", async () => {
            const job = await service().create(projectId, { prompt: "Rename the price API", scope: "selection", microfrontendIds: [String(cart._id), String(catalog._id)] })

            expect(job).toMatchObject({ status: AiJobStatus.PENDING, scope: "selection", rootJobId: job._id, usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 } })
            const requests = (AiChangeRequest.create as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([document]) => document as Record<string, unknown>)
            expect(requests).toEqual([
                expect.objectContaining({ microfrontendId: cart._id, jobId: expect.anything(), jobRepositoryCount: 2, baseBranch: "main", status: AiChangeStatus.PENDING }),
                expect.objectContaining({ microfrontendId: catalog._id, jobRepositoryCount: 2 })
            ])
            expect(String(requests[0].jobId)).toBe(job._id)
        })

        it("Given a microfrontend and a service selected, when the job is started, then the job lists each under its kind and each gets its request", async () => {
            services = [catalogApi]

            await service().create(projectId, { prompt: "Expose the price", scope: "selection", microfrontendIds: [String(cart._id)], serviceIds: [String(catalogApi._id)] })

            expect(AiChangeJob.create).toHaveBeenCalledWith(expect.objectContaining({ microfrontendIds: [cart._id], serviceIds: [catalogApi._id] }))
            const requests = (AiChangeRequest.create as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([document]) => document as Record<string, unknown>)
            expect(requests).toEqual([
                expect.objectContaining({ microfrontendId: cart._id, jobRepositoryCount: 2 }),
                expect.objectContaining({ serviceId: catalogApi._id, jobRepositoryCount: 2, baseBranch: "main" })
            ])
            expect(requests[1].microfrontendId).toBeUndefined()
        })

        it("Given a service with a repository, when a global job is started, then it works on the service too", async () => {
            services = [catalogApi]

            await service().create(projectId, { prompt: "Expose the price", scope: "global" })

            expect(AiChangeJob.create).toHaveBeenCalledWith(expect.objectContaining({ scope: "global", microfrontendIds: [catalog._id, cart._id], serviceIds: [catalogApi._id] }))
        })

        describe("on a domain", () => {
            const checkoutId = new Types.ObjectId()
            const checkout = { _id: checkoutId, projectId, slug: "checkout", name: "Checkout", description: "From the cart to the payment" }

            beforeEach(() => {
                vi.spyOn(Domain, "findOne").mockImplementation(((filter: { _id: unknown; projectId: unknown }) =>
                    Promise.resolve(String(filter._id) === String(checkoutId) && String(filter.projectId) === projectId ? checkout : null)) as never)
            })

            it("Given a domain with a microfrontend and a service, when its job is started, then it works on its members only and remembers the domain", async () => {
                withRepository = [{ ...cart, domainId: checkoutId } as never, catalog]
                services = [{ ...catalogApi, domainId: checkoutId } as never]

                const job = await service().create(projectId, { prompt: "Show the shipping cost", scope: "domain", domainId: String(checkoutId) })

                expect(AiChangeJob.create).toHaveBeenCalledWith(expect.objectContaining({ scope: "domain", domainId: checkoutId, microfrontendIds: [cart._id], serviceIds: [catalogApi._id] }))
                expect(job).toMatchObject({ scope: "domain", domainId: String(checkoutId) })
            })

            it("Given a domain whose members have no repository, when its job is started, then it is refused naming the domain", async () => {
                withRepository = [catalog]

                await expect(service().create(projectId, { prompt: "Show the shipping cost", scope: "domain", domainId: String(checkoutId) })).rejects.toMatchObject({
                    code: "AI_JOB_NO_REPOSITORIES",
                    message: expect.stringContaining("Checkout")
                })
                expect(AiChangeJob.create).not.toHaveBeenCalled()
            })

            it("Given a domain of another project, when its job is started, then it is not found", async () => {
                const elsewhere = new Types.ObjectId().toString()

                await expect(service().create(projectId, { prompt: "Show the shipping cost", scope: "domain", domainId: elsewhere })).rejects.toMatchObject({
                    message: expect.stringContaining(elsewhere)
                })
                expect(AiChangeJob.create).not.toHaveBeenCalled()
            })

            it("Given a domain with more than 10 members with a repository, when its job is started, then it is refused", async () => {
                withRepository = Array.from({ length: 11 }, (_, index) => ({ ...microfrontend(`mfe-${index}`, `Mfe ${index}`), domainId: checkoutId }) as never)

                await expect(service().create(projectId, { prompt: "Show the shipping cost", scope: "domain", domainId: String(checkoutId) })).rejects.toMatchObject({
                    code: "AI_JOB_TOO_MANY_REPOSITORIES"
                })
            })
        })

        it("Given a selected service of another project, when the job is started, then it is not found", async () => {
            services = [{ ...catalogApi, projectId: new Types.ObjectId().toString() }]

            await expect(service().create(projectId, { prompt: "Expose the price", scope: "selection", serviceIds: [String(catalogApi._id)] })).rejects.toMatchObject({
                message: expect.stringContaining(String(catalogApi._id))
            })
            expect(AiChangeJob.create).not.toHaveBeenCalled()
        })
    })

    describe("followUp", () => {
        const parentJobId = new Types.ObjectId()
        const rootJobId = new Types.ObjectId()
        const parentRequest = (status: AiChangeStatus) => ({ _id: new Types.ObjectId(), jobId: parentJobId, microfrontendId: catalog._id, baseBranch: "develop", status, files: [] })
        let parentStatus: AiJobStatus
        let requests: ReturnType<typeof parentRequest>[]

        beforeEach(() => {
            parentStatus = AiJobStatus.DONE
            requests = [parentRequest(AiChangeStatus.PROPOSED)]
            vi.spyOn(AiChangeJobService.prototype as unknown as WithProcess, "process").mockResolvedValue(undefined)
            vi.spyOn(AiChangeJob, "findById").mockImplementation((() =>
                Promise.resolve({
                    _id: parentJobId,
                    rootJobId,
                    projectId,
                    userId: user._id,
                    prompt: "Rename the price API",
                    scope: "global",
                    microfrontendIds: [catalog._id],
                    status: parentStatus,
                    usage: {},
                    updatedAt: new Date()
                })) as never)
            vi.spyOn(AiChangeRequest, "find").mockImplementation(((filter: { jobId: unknown }) => Promise.resolve(filter.jobId === parentJobId ? requests : [])) as never)
        })

        it("Given a finished job, when it is followed up, then the child joins its chain and each request refines the parent's one on the same branch", async () => {
            const child = await service().followUp(String(parentJobId), { prompt: "Also rename the tests" })

            expect(child).toMatchObject({ parentJobId: String(parentJobId), rootJobId: String(rootJobId), scope: "global" })
            expect(AiChangeRequest.create).toHaveBeenCalledWith(expect.objectContaining({ microfrontendId: catalog._id, parentId: requests[0]._id, baseBranch: "develop" }))
        })

        it("Given a job of a domain, when it is followed up, then the child stays in the domain", async () => {
            const domainId = new Types.ObjectId()
            vi.spyOn(AiChangeJob, "findById").mockImplementation((() =>
                Promise.resolve({
                    _id: parentJobId,
                    rootJobId,
                    projectId,
                    userId: user._id,
                    prompt: "Show the shipping cost",
                    scope: "domain",
                    domainId,
                    microfrontendIds: [catalog._id],
                    status: parentStatus,
                    usage: {},
                    updatedAt: new Date()
                })) as never)

            await service().followUp(String(parentJobId), { prompt: "Also in the summary" })

            expect(AiChangeJob.create).toHaveBeenCalledWith(expect.objectContaining({ scope: "domain", domainId, parentJobId }))
        })

        it("Given a job still running, when it is followed up, then it is refused", async () => {
            parentStatus = AiJobStatus.RUNNING

            await expect(service().followUp(String(parentJobId), { prompt: "Also rename the tests" })).rejects.toMatchObject({ code: "AI_JOB_NOT_DONE", statusCode: 409 })
        })

        it("Given a follow-up of the job still running, when another one is asked, then it is refused", async () => {
            vi.spyOn(AiChangeJob, "exists").mockResolvedValue({ _id: new Types.ObjectId() } as never)

            await expect(service().followUp(String(parentJobId), { prompt: "Also rename the tests" })).rejects.toMatchObject({ code: "AI_JOB_FOLLOW_UP_RUNNING", statusCode: 409 })
            expect(AiChangeJob.create).not.toHaveBeenCalled()
        })

        it("Given a proposal already applied, when it is followed up, then there is nothing left to refine", async () => {
            requests = [parentRequest(AiChangeStatus.APPLIED)]

            await expect(service().followUp(String(parentJobId), { prompt: "Also rename the tests" })).rejects.toMatchObject({ code: "AI_CHANGE_NOT_PROPOSED" })
            expect(AiChangeJob.create).not.toHaveBeenCalled()
        })
    })

    describe("process", () => {
        let dir: string
        let jobId: Types.ObjectId
        let parentJobId: Types.ObjectId
        let parent: { _id: Types.ObjectId; files: Record<string, unknown>[] }
        let request: Record<string, unknown>
        let workingCopy: Record<string, ReturnType<typeof vi.fn> | string>
        let microfrontendIds: Types.ObjectId[]

        beforeEach(() => {
            dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-job-"))
            fs.mkdirSync(path.join(dir, "src"))
            fs.writeFileSync(path.join(dir, "src/App.tsx"), "base\n")
            jobId = new Types.ObjectId()
            parentJobId = new Types.ObjectId()
            parent = {
                _id: new Types.ObjectId(),
                files: [
                    { path: "src/App.tsx", action: "update", baseBlobOid: "app-blob", proposedContent: "first proposal\n" },
                    { path: "src/Price.tsx", action: "create", proposedContent: "export const Price = () => null\n" }
                ]
            }
            request = { _id: new Types.ObjectId(), jobId, microfrontendId: catalog._id, baseBranch: "main", parentId: parent._id }
            workingCopy = {
                dir,
                blobOid: vi.fn(async (_commit: string, file: string) => (file === "src/App.tsx" ? "app-blob" : undefined)),
                changes: vi.fn(async () => [{ path: "src/App.tsx", action: "update", baseBlobOid: "app-blob" }]),
                readHeadFile: vi.fn(async () => "base\n"),
                readWorkingFile: vi.fn(async (file: string) => fs.readFileSync(path.join(dir, file), "utf8")),
                discardChanges: vi.fn(async () => undefined)
            }
            workspaces.set(String(catalog._id), { target: {}, workingCopy, defaultBranch: "main" })
            microfrontends = [catalog]
            microfrontendIds = [catalog._id]

            const jobs: Record<string, unknown> = {
                [String(jobId)]: {
                    _id: jobId,
                    parentJobId,
                    rootJobId: parentJobId,
                    projectId,
                    userId: user._id,
                    prompt: "Also show the currency",
                    microfrontendIds,
                    status: AiJobStatus.RUNNING
                },
                [String(parentJobId)]: { _id: parentJobId, rootJobId: parentJobId, prompt: "Show the price", summary: "Added the price" }
            }
            vi.spyOn(AiChangeJob, "findById").mockImplementation(((id: unknown) => Promise.resolve(jobs[String(id)] ?? null)) as never)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([request] as never)
            vi.spyOn(AiChangeRequest, "findById").mockImplementation(((id: unknown) => Promise.resolve(String(id) === String(parent._id) ? parent : null)) as never)
            runAgent.mockImplementation(async (_client: unknown, _input: unknown, hooks: { onUsage: (usage: unknown) => Promise<void> }) => {
                await hooks.onUsage({ inputTokens: 10, cachedInputTokens: 4, outputTokens: 5 })
                await hooks.onUsage({ inputTokens: 20, cachedInputTokens: 8, outputTokens: 7 })
                fs.writeFileSync(path.join(dir, "src/App.tsx"), "first proposal with currency\n")
                return { summary: "Shows the price with its currency", stopReason: "finished" }
            })
        })

        afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

        const run = () => (service() as unknown as WithProcess).process(String(jobId), {} as LlmClient)

        it("Given a follow-up, when it runs, then the agent starts from the parent's files, sees the chain, and its proposal supersedes the parent", async () => {
            let onDisk: Record<string, string> = {}
            runAgent.mockImplementationOnce(async (_client: unknown, input: { previousRequests: unknown; repositories: { microfrontend: { slug: string }; previousChanges: unknown }[] }) => {
                onDisk = { app: fs.readFileSync(path.join(dir, "src/App.tsx"), "utf8"), price: fs.readFileSync(path.join(dir, "src/Price.tsx"), "utf8") }
                expect(input.previousRequests).toEqual([{ prompt: "Show the price", summary: "Added the price" }])
                expect(input.repositories.map(repository => repository.microfrontend.slug)).toEqual(["catalog"])
                // The parent's files count towards the limits of the follow-up.
                expect(input.repositories[0].previousChanges).toEqual([
                    { path: "src/App.tsx", bytes: 15 },
                    { path: "src/Price.tsx", bytes: 32 }
                ])
                return { summary: "Shows the price with its currency", stopReason: "finished" }
            })

            await run()

            expect(onDisk).toEqual({ app: "first proposal\n", price: "export const Price = () => null\n" })
            expect(pushed(updates)).toEqual(expect.arrayContaining(["preparing", "applying-previous", "working", "proposed", "superseded"]))
            const proposal = updates.find(({ update }) => update.status === AiChangeStatus.PROPOSED)
            expect(proposal).toMatchObject({ filter: { _id: request._id, status: AiChangeStatus.RUNNING }, update: { summary: "Shows the price with its currency" } })
            expect(updates).toContainEqual(
                expect.objectContaining({ filter: { _id: parent._id, status: AiChangeStatus.PROPOSED }, update: expect.objectContaining({ status: AiChangeStatus.DISCARDED }) })
            )
            expect(updates).toContainEqual(
                expect.objectContaining({ model: "job", filter: { _id: jobId, status: AiJobStatus.RUNNING }, update: expect.objectContaining({ status: AiJobStatus.DONE }) })
            )
            expect(workingCopy.discardChanges).toHaveBeenCalled()
        })

        it("Given a job on a microfrontend and a service of the same slug, when it runs, then the agent sees both under distinct slugs and the service with its container facts", async () => {
            services = [catalogApi]
            const serviceRequest = { _id: new Types.ObjectId(), jobId, serviceId: catalogApi._id, baseBranch: "main" }
            vi.spyOn(AiChangeJob, "findById").mockImplementation(((id: unknown) =>
                Promise.resolve(
                    String(id) === String(jobId)
                        ? {
                              _id: jobId,
                              rootJobId: jobId,
                              projectId,
                              userId: user._id,
                              prompt: "Expose the price",
                              microfrontendIds: [catalog._id],
                              serviceIds: [catalogApi._id],
                              status: AiJobStatus.RUNNING
                          }
                        : null
                )) as never)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([{ ...request, parentId: undefined }, serviceRequest] as never)
            workspaces.set(String(catalogApi._id), {
                target: {},
                workingCopy: {
                    dir: `${dir}-service`,
                    changes: vi.fn(async () => [{ path: "src/routes/price.ts", action: "create" }]),
                    readWorkingFile: vi.fn(async () => "export const price = 1\n"),
                    discardChanges: vi.fn(async () => undefined)
                },
                defaultBranch: "main"
            })
            let input: { repositories: { microfrontend?: { slug: string }; service?: Record<string, unknown> }[] } | undefined
            runAgent.mockImplementationOnce(async (_client: unknown, received: typeof input) => {
                input = received
                return { summary: "Exposed the price", stopReason: "finished" }
            })

            await run()

            expect(input?.repositories.map(repository => repository.microfrontend?.slug ?? repository.service?.slug)).toEqual(["catalog", "catalog-service"])
            expect(input?.repositories[1].service).toEqual({
                name: "Catalog API",
                slug: "catalog-service",
                runtime: "NODE",
                framework: "Express",
                port: 3000,
                livenessPath: "/healthz/live",
                readinessPath: "/healthz/ready",
                docsPath: "/docs",
                env: [{ name: "DATABASE_URL", required: true, secret: true, description: "Postgres connection string" }],
                context: undefined
            })
            expect(updates).toContainEqual(
                expect.objectContaining({ filter: { _id: serviceRequest._id, status: AiChangeStatus.RUNNING }, update: expect.objectContaining({ status: AiChangeStatus.PROPOSED }) })
            )
        })

        it("Given a job of a domain, when it runs, then the agent is told what the domain is for", async () => {
            const domainId = new Types.ObjectId()
            const job = { _id: jobId, rootJobId: jobId, projectId, userId: user._id, prompt: "Show the shipping cost", domainId, microfrontendIds, status: AiJobStatus.RUNNING }
            vi.spyOn(AiChangeJob, "findById").mockImplementation(((id: unknown) => Promise.resolve(String(id) === String(jobId) ? job : null)) as never)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([{ ...request, parentId: undefined }] as never)
            vi.spyOn(Domain, "findById").mockResolvedValue({ _id: domainId, name: "Checkout", description: "From the cart to the payment" } as never)
            let received: { domain?: unknown } | undefined
            runAgent.mockImplementationOnce(async (_client: unknown, input: typeof received) => {
                received = input
                return { summary: "Shows the shipping cost", stopReason: "finished" }
            })

            await run()

            expect(Domain.findById).toHaveBeenCalledWith(domainId)
            expect(received?.domain).toEqual({ name: "Checkout", description: "From the cart to the payment" })
        })

        it("Given a file of the parent changed on the base branch since, when the follow-up runs, then it fails naming the file and the parent stays applicable", async () => {
            vi.mocked(workingCopy.blobOid as ReturnType<typeof vi.fn>).mockResolvedValue("someone-else-blob")

            await run()

            expect(runAgent).not.toHaveBeenCalled()
            const failure = updates.find(({ model, update }) => model === "request" && update.status === AiChangeStatus.FAILED)
            expect(failure?.update.error).toContain("catalog/src/App.tsx")
            expect(updates).toContainEqual(expect.objectContaining({ model: "job", update: expect.objectContaining({ status: AiJobStatus.FAILED }) }))
            expect(updates.some(({ update }) => update.status === AiChangeStatus.DISCARDED)).toBe(false)
            expect(fs.readFileSync(path.join(dir, "src/App.tsx"), "utf8")).toBe("base\n")
        })

        it("Given an agent spending tokens over two rounds, when it runs, then job and requests add each round, cached tokens included, and the total is audited once", async () => {
            await run()

            const increments = updates.filter(({ update }) => update.$inc).map(({ model, update }) => ({ model, inc: update.$inc }))
            expect(increments).toEqual([
                { model: "job", inc: { "usage.inputTokens": 10, "usage.cachedInputTokens": 4, "usage.outputTokens": 5 } },
                { model: "request", inc: { "usage.inputTokens": 10, "usage.cachedInputTokens": 4, "usage.outputTokens": 5 } },
                { model: "job", inc: { "usage.inputTokens": 20, "usage.cachedInputTokens": 8, "usage.outputTokens": 7 } },
                { model: "request", inc: { "usage.inputTokens": 20, "usage.cachedInputTokens": 8, "usage.outputTokens": 7 } }
            ])
            const audits = log.info.mock.calls.filter(([entry]) => entry?.audit === "ai_job_usage")
            expect(audits).toEqual([[{ audit: "ai_job_usage", userId: String(user._id), projectId, jobId: String(jobId), inputTokens: 30, cachedInputTokens: 12, outputTokens: 12 }, "AI job usage"]])
        })

        it("Given a proposal of more files than a repository allows, when it is collected, then the job fails before any request is proposed", async () => {
            vi.mocked(workingCopy.changes as ReturnType<typeof vi.fn>).mockResolvedValue(
                Array.from({ length: 21 }, (_, index) => ({ path: `src/generated/file-${index}.ts`, action: "delete", baseBlobOid: "blob" }))
            )

            await run()

            expect(updates.some(({ update }) => update.status === AiChangeStatus.PROPOSED)).toBe(false)
            expect(updates).toContainEqual(expect.objectContaining({ model: "job", update: expect.objectContaining({ status: AiJobStatus.FAILED, error: expect.stringContaining("21 files") }) }))
        })

        it("Given a save that fails after one proposal was stored, when the job ends, then it is done with the partial failure and the rest failed", async () => {
            const cartRequest = { _id: new Types.ObjectId(), jobId, microfrontendId: cart._id, baseBranch: "main" }
            microfrontends = [catalog, cart]
            microfrontendIds.push(cart._id)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([request, cartRequest] as never)
            workspaces.set(String(cart._id), {
                target: {},
                workingCopy: {
                    dir: `${dir}-cart`,
                    changes: vi.fn(async () => [{ path: "src/Cart.tsx", action: "create" }]),
                    readWorkingFile: vi.fn(async () => "cart\n"),
                    discardChanges: vi.fn(async () => undefined)
                },
                defaultBranch: "main"
            })
            vi.spyOn(AiChangeRequest, "findOneAndUpdate").mockImplementation(((filter: Record<string, unknown>, update: Record<string, unknown>) => {
                if (filter._id === cartRequest._id && update.status === AiChangeStatus.PROPOSED) return Promise.reject(new Error("document too large"))
                updates.push({ model: "request", filter, update })
                return Promise.resolve({ ...filter, ...update })
            }) as never)

            await run()

            expect(updates).toContainEqual(
                expect.objectContaining({ filter: { _id: request._id, status: AiChangeStatus.RUNNING }, update: expect.objectContaining({ status: AiChangeStatus.PROPOSED }) })
            )
            expect(updates).toContainEqual(
                expect.objectContaining({
                    model: "request",
                    update: expect.objectContaining({ status: AiChangeStatus.FAILED, error: expect.stringContaining("Only 1 of 2 proposals could be saved") })
                })
            )
            const done = updates.find(({ model, update }) => model === "job" && update.status === AiJobStatus.DONE)
            expect(done?.update.error).toContain("document too large")
            expect(updates.some(({ model, update }) => model === "job" && update.status === AiJobStatus.FAILED)).toBe(false)
        })

        const rateLimit = () => new Error("Your requests to gpt-6.1-sol for gpt-6.1-sol in northcentralus have exceeded token rate limit.")
        const failed = () => updates.some(({ update }) => update.status === AiChangeStatus.FAILED || update.status === AiJobStatus.FAILED)

        it("Given an agent that stops midway after writing files, when the job ends, then what it wrote is proposed as incomplete and the job is done", async () => {
            runAgent.mockImplementationOnce(async () => {
                fs.writeFileSync(path.join(dir, "src/App.tsx"), "half done\n")
                throw rateLimit()
            })

            await run()

            const proposal = updates.find(({ model, update }) => model === "request" && update.status === AiChangeStatus.PROPOSED)
            expect(proposal?.update.files).toEqual([expect.objectContaining({ path: "src/App.tsx", proposedContent: "half done\n" })])
            expect(proposal?.update.error).toMatch(/incomplete.*exceeded token rate limit/)
            expect(updates).toContainEqual(expect.objectContaining({ model: "job", update: expect.objectContaining({ status: AiJobStatus.DONE }) }))
            expect(failed()).toBe(false)
            expect(workingCopy.discardChanges).toHaveBeenCalled()
        })

        it("Given an agent that stops before writing anything, when the job ends, then it fails with the provider's error", async () => {
            vi.mocked(workingCopy.changes as ReturnType<typeof vi.fn>).mockResolvedValue([])
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([{ ...request, parentId: undefined }] as never)
            runAgent.mockRejectedValueOnce(rateLimit())

            await run()

            expect(updates.some(({ update }) => update.status === AiChangeStatus.PROPOSED)).toBe(false)
            expect(updates).toContainEqual(expect.objectContaining({ model: "job", update: expect.objectContaining({ status: AiJobStatus.FAILED, error: expect.stringContaining("rate limit") }) }))
        })

        it("Given a follow-up whose agent stops before changing the parent's files, when the job ends, then it fails and the parent stays applicable", async () => {
            // The working copy holds the parent's files, restored before the agent ran.
            vi.mocked(workingCopy.changes as ReturnType<typeof vi.fn>).mockResolvedValue([
                { path: "src/App.tsx", action: "update", baseBlobOid: "app-blob" },
                { path: "src/Price.tsx", action: "create" }
            ])
            runAgent.mockRejectedValueOnce(rateLimit())

            await run()

            expect(updates.some(({ update }) => update.status === AiChangeStatus.PROPOSED || update.status === AiChangeStatus.DISCARDED)).toBe(false)
            expect(updates).toContainEqual(expect.objectContaining({ model: "job", update: expect.objectContaining({ status: AiJobStatus.FAILED, error: expect.stringContaining("rate limit") }) }))
        })

        it("Given a job declared dead while its agent works, when the agent stops, then nothing it wrote is proposed", async () => {
            runAgent.mockImplementationOnce(async (_client: unknown, _input: unknown, hooks: { onUsage: (usage: unknown) => Promise<void> }, signal: AbortSignal) => {
                fs.writeFileSync(path.join(dir, "src/App.tsx"), "half done\n")
                const job = (await AiChangeJob.findById(jobId)) as unknown as { status: AiJobStatus }
                job.status = AiJobStatus.FAILED
                await hooks.onUsage({ inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 })
                signal.throwIfAborted()
                return { summary: "", stopReason: "finished" }
            })

            await run()

            expect(updates.some(({ update }) => update.status === AiChangeStatus.PROPOSED)).toBe(false)
        })
    })

    describe("apply", () => {
        const jobId = new Types.ObjectId()
        let status: AiJobStatus

        beforeEach(() => {
            status = AiJobStatus.DONE
            vi.spyOn(AiChangeJob, "findById").mockImplementation((() =>
                Promise.resolve({ _id: jobId, rootJobId: jobId, projectId, userId: user._id, microfrontendIds: [catalog._id, cart._id], status, usage: {}, updatedAt: new Date() })) as never)
            const proposal = (owner: { _id: Types.ObjectId }) => ({
                _id: new Types.ObjectId(),
                jobId,
                microfrontendId: owner._id,
                status: AiChangeStatus.PROPOSED,
                files: [{ path: "src/a.ts", action: "update", baseBlobOid: "blob", proposedContent: "x" }]
            })
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([proposal(cart), proposal(catalog)] as never)
        })

        const claims = () => updates.filter(({ update }) => update.status === AiChangeStatus.APPLYING)

        it("Given a job not finished, when it is applied, then it is refused", async () => {
            status = AiJobStatus.RUNNING

            await expect(service().apply(String(jobId))).rejects.toMatchObject({ code: "AI_JOB_NOT_DONE", statusCode: 409 })
        })

        it("Given a follow-up refining one of its proposals, when the job is applied, then nothing is claimed", async () => {
            vi.spyOn(AiChangeRequest, "exists").mockResolvedValue({ _id: new Types.ObjectId() } as never)
            const applyClaimed = vi.spyOn(AiChangeJobService.prototype as unknown as WithApplyClaimed, "applyClaimed")

            await expect(service().apply(String(jobId))).rejects.toMatchObject({ code: "AI_JOB_FOLLOW_UP_RUNNING", statusCode: 409 })
            expect(claims()).toEqual([])
            expect(applyClaimed).not.toHaveBeenCalled()
        })

        it("Given two proposals, when the job is applied, then it answers with both claimed and opens the pull requests afterwards, each naming the other", async () => {
            let release: () => void = () => undefined
            const firstDone = new Promise<void>(resolve => {
                release = resolve
            })
            const applyClaimed = vi
                .spyOn(AiChangeJobService.prototype as unknown as WithApplyClaimed, "applyClaimed")
                .mockImplementationOnce(async () => {
                    await firstDone
                    return { pullRequestUrl: "https://github.com/acme/catalog/pull/1" }
                })
                .mockResolvedValueOnce({ pullRequestUrl: "https://github.com/acme/cart/pull/2" })

            await service().apply(String(jobId))

            expect(claims()).toHaveLength(2)
            expect(applyClaimed.mock.calls.length).toBeLessThanOrEqual(1)
            release()
            await vi.waitFor(() => expect(applyClaimed).toHaveBeenCalledTimes(2))
            expect(applyClaimed.mock.calls.map(([, , related]) => related)).toEqual([["Cart"], ["Catalog: https://github.com/acme/catalog/pull/1"]])
            expect(pushed(updates)).toContain("applying")
        })

        it("Given a proposal that cannot be applied, when the job is applied, then the next one is applied anyway", async () => {
            const applyClaimed = vi
                .spyOn(AiChangeJobService.prototype as unknown as WithApplyClaimed, "applyClaimed")
                .mockRejectedValueOnce(new Error("conflict"))
                .mockResolvedValueOnce({})

            await service().apply(String(jobId))

            await vi.waitFor(() => expect(applyClaimed).toHaveBeenCalledTimes(2))
        })
    })

    describe("working", () => {
        it("Given two jobs on the catalog and a change on the cart alone, when the project is asked, then each microfrontend counts its agents", async () => {
            vi.spyOn(AiChangeJob, "find").mockResolvedValue([{ microfrontendIds: [catalog._id, cart._id], serviceIds: [catalogApi._id] }, { microfrontendIds: [catalog._id] }] as never)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([{ microfrontendId: cart._id }] as never)

            const working = await service().working(projectId)

            expect(working).toEqual(
                expect.arrayContaining([
                    { microfrontendId: String(catalog._id), agents: 2 },
                    { microfrontendId: String(cart._id), agents: 2 },
                    { microfrontendId: String(catalogApi._id), agents: 1 }
                ])
            )
            // Only what is running and still alive: a job's own requests are counted through the job.
            const [jobFilter] = (AiChangeJob.find as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
            expect(jobFilter).toMatchObject({ status: { $in: [AiJobStatus.PENDING, AiJobStatus.RUNNING] }, updatedAt: { $gt: expect.any(Date) } })
            const [requestFilter] = (AiChangeRequest.find as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
            expect(requestFilter).toMatchObject({ jobId: { $exists: false }, status: { $in: [AiChangeStatus.PENDING, AiChangeStatus.RUNNING] } })
        })

        it("Given nothing running, when the project is asked, then no microfrontend is listed", async () => {
            vi.spyOn(AiChangeJob, "find").mockResolvedValue([] as never)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([] as never)

            expect(await service().working(projectId)).toEqual([])
        })
    })

    describe("domainConversations", () => {
        it("Given a chain with follow-ups and another conversation, when the domain is listed, then each conversation comes with its first and its latest job only, newest first", async () => {
            const domainId = new Types.ObjectId()
            const job = (rootJobId: Types.ObjectId | undefined, prompt: string, minutes: number) => {
                const _id = new Types.ObjectId()
                return {
                    _id,
                    rootJobId: rootJobId ?? _id,
                    projectId,
                    userId: user._id,
                    prompt,
                    scope: "domain",
                    domainId,
                    status: AiJobStatus.DONE,
                    microfrontendIds: [],
                    serviceIds: [],
                    createdAt: new Date(Date.UTC(2026, 9, 19, 10, minutes)),
                    updatedAt: new Date()
                }
            }
            const shipping = job(undefined, "Show the shipping cost", 0)
            const middle = job(shipping._id, "Also in the summary", 10)
            const latest = job(shipping._id, "And in the email", 20)
            const coupons = job(undefined, "Accept coupons", 5)
            const chains = [shipping, middle, latest, coupons]
            const find = vi.spyOn(AiChangeJob, "find").mockImplementation((() => ({ sort: () => ({ limit: () => Promise.resolve([shipping, coupons]) }) })) as never)
            vi.spyOn(AiChangeJob, "findOne").mockImplementation(((filter: { rootJobId: unknown }) => ({
                sort: () => Promise.resolve(chains.filter(candidate => String(candidate.rootJobId) === String(filter.rootJobId)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0])
            })) as never)
            vi.spyOn(AiChangeRequest, "find").mockResolvedValue([] as never)

            const conversations = await service().domainConversations(projectId, String(domainId))

            expect(find).toHaveBeenCalledWith(expect.objectContaining({ domainId: String(domainId), $expr: { $eq: ["$_id", "$rootJobId"] } }), expect.anything())
            expect(conversations.map(view => view.prompt)).toEqual(["And in the email", "Accept coupons", "Show the shipping cost"])
        })
    })
})
