import { beforeEach, describe, expect, it, vi } from "vitest"
import { createBusinessException } from "../../errors/BusinessException"
import UserCannotAccessThisProjectError from "../../errors/UserCannotAccessThisProjectError"
import { McpSession, McpToolContext } from "../toolDefinition"
import { aiChangeTools } from "./aiChangeTools"

const createChange = vi.fn()
const listChanges = vi.fn()
const getChange = vi.fn()
const applyChange = vi.fn()
const openPullRequest = vi.fn()
const discardChange = vi.fn()
const createJob = vi.fn()
const followUpJob = vi.fn()
const getJob = vi.fn()
const applyJob = vi.fn()
const availableForProject = vi.fn()
const listJobs = vi.fn()
const planDomain = vi.fn()

const { constructed } = vi.hoisted(() => ({ constructed: [] as unknown[][] }))

vi.mock("../..", () => ({ fastify: { config: { AI_PROVIDER: "anthropic" } } }))
vi.mock("../../service/aiChange/AiChangeService", () => ({
    default: class {
        constructor(...args: unknown[]) {
            constructed.push(args)
        }
        create = (...args: unknown[]) => createChange(...args)
        list = (...args: unknown[]) => listChanges(...args)
        get = (...args: unknown[]) => getChange(...args)
        apply = (...args: unknown[]) => applyChange(...args)
        openPullRequest = (...args: unknown[]) => openPullRequest(...args)
        discard = (...args: unknown[]) => discardChange(...args)
    }
}))

vi.mock("../../service/AiModelService", () => ({
    default: class {
        availableForProject = (...args: unknown[]) => availableForProject(...args)
    }
}))

vi.mock("../../service/aiChange/DomainPlanService", () => ({
    default: class {
        plan = (...args: unknown[]) => planDomain(...args)
    }
}))

vi.mock("../../service/aiChange/AiChangeJobService", () => ({
    default: class {
        create = (...args: unknown[]) => createJob(...args)
        followUp = (...args: unknown[]) => followUpJob(...args)
        get = (...args: unknown[]) => getJob(...args)
        apply = (...args: unknown[]) => applyJob(...args)
        list = (...args: unknown[]) => listJobs(...args)
    }
}))

const PROJECT = "aaaaaaaaaaaaaaaaaaaaaaaa"
const MICROFRONTEND = "bbbbbbbbbbbbbbbbbbbbbbbb"
const SERVICE = "eeeeeeeeeeeeeeeeeeeeeeee"
const CHANGE = "cccccccccccccccccccccccc"
const JOB = "dddddddddddddddddddddddd"

const tool = (name: string) => aiChangeTools.find(candidate => candidate.name === name)!

const context = (): McpToolContext => {
    const session: McpSession = {
        principal: { _id: "user-1", email: "user@example.com" } as never,
        projects: [{ projectId: PROJECT, role: "MEMBER" }],
        scopes: ["mfe:read", "mfe:write"],
        credential: { kind: "console", userId: "user-1" }
    }
    return { principal: { ...session.principal, restrictedToProjectIds: [PROJECT] }, projectId: PROJECT, scopes: session.scopes, credential: session.credential, session }
}

const run = (name: string, args: Record<string, unknown>) => tool(name).run(args as never, context())

const changeDocument = (status: string) => ({
    _id: { toString: () => CHANGE },
    jobId: JOB,
    microfrontendId: MICROFRONTEND,
    status,
    prompt: "Add a footer",
    baseBranch: "main",
    summary: "Adds a footer",
    files: [{ path: "src/Footer.tsx", action: "create", proposedContent: "export const Footer = () => null", originalContent: "old" }],
    events: Array.from({ length: 15 }, (_, index) => ({ at: new Date(0), kind: "tool", message: `step ${index}` })),
    usage: { inputTokens: 1200, cachedInputTokens: 800, outputTokens: 300 },
    createdAt: new Date(0),
    updatedAt: new Date(0)
})

const jobView = (status: string) => ({
    _id: JOB,
    projectId: PROJECT,
    userId: "user-1",
    rootJobId: JOB,
    prompt: "Rename the price API",
    scope: "global",
    status,
    events: Array.from({ length: 15 }, (_, index) => ({ at: new Date(0), kind: "tool", message: `step ${index}` })),
    usage: { inputTokens: 1200, cachedInputTokens: 800, outputTokens: 300 },
    repositories: [
        {
            requestId: CHANGE,
            kind: "microfrontend",
            microfrontendId: MICROFRONTEND,
            microfrontendName: "Cart",
            microfrontendSlug: "cart",
            status: "PROPOSED",
            files: [{ path: "src/Price.ts", action: "update" }]
        }
    ],
    createdAt: new Date(0),
    updatedAt: new Date(0)
})

const forbidden = () => createBusinessException({ code: "AI_CHANGE_FORBIDDEN", message: "A viewer cannot change the code of a microfrontend", statusCode: 403 })

describe("AI change tools", () => {
    beforeEach(() => {
        for (const mock of [createChange, listChanges, getChange, applyChange, openPullRequest, discardChange, createJob, followUpJob, getJob, applyJob, availableForProject, listJobs, planDomain]) {
            mock.mockReset()
        }
        constructed.length = 0
    })

    it("given their definitions, when read, then every one is console-only and applying (a pull request) is the destructive, open world one", () => {
        for (const definition of aiChangeTools) {
            expect(definition.consoleOnly, definition.name).toBe(true)
        }
        expect(tool("ai_change_apply").annotations).toMatchObject({ destructiveHint: true, openWorldHint: true })
        expect(aiChangeTools.filter(definition => definition.annotations.destructiveHint).map(definition => definition.name)).toEqual(["ai_change_apply", "ai_job_apply"])
        expect(tool("ai_job_apply").requiresConfirmation).toBe(true)
    })

    describe("ai_change_start", () => {
        it("given a prompt, when started, then the service gets the project-bound principal and the configuration, and the view leaves file contents out", async () => {
            createChange.mockResolvedValue(changeDocument("PENDING"))

            const result = (await run("ai_change_start", { microfrontendId: MICROFRONTEND, prompt: "Add a footer" })) as Record<string, unknown>

            expect(createChange).toHaveBeenCalledWith({ kind: "microfrontend", id: MICROFRONTEND }, { prompt: "Add a footer", baseBranch: undefined })
            expect(constructed[0]).toEqual([expect.objectContaining({ restrictedToProjectIds: [PROJECT] }), { AI_PROVIDER: "anthropic" }])
            expect(result).toMatchObject({ id: CHANGE, jobId: JOB, status: "PENDING", files: [{ path: "src/Footer.tsx", action: "create" }], usage: { cachedInputTokens: 800 } })
            expect(JSON.stringify(result)).not.toContain("export const Footer")
            expect(result.recentEvents).toHaveLength(10)
        })

        it("given an empty prompt, when the input is validated, then it is refused", () => {
            expect(tool("ai_change_start").inputSchema.safeParse({ microfrontendId: MICROFRONTEND, prompt: "  " }).success).toBe(false)
        })

        it("given a service, when started, then the change works on the repository of the service", async () => {
            createChange.mockResolvedValue({ ...changeDocument("PENDING"), microfrontendId: undefined, serviceId: SERVICE })

            await run("ai_change_start", { serviceId: SERVICE, prompt: "Add a health check" })

            expect(createChange).toHaveBeenCalledWith({ kind: "service", id: SERVICE }, expect.objectContaining({ prompt: "Add a health check" }))
        })

        it("given both a microfrontend and a service, or neither, when the input is validated, then it is refused", () => {
            const schema = tool("ai_change_start").inputSchema
            expect(schema.safeParse({ microfrontendId: MICROFRONTEND, serviceId: SERVICE, prompt: "Add a footer" }).success).toBe(false)
            expect(schema.safeParse({ prompt: "Add a footer" }).success).toBe(false)
        })

        it("given a viewer, when started, then the service's refusal surfaces", async () => {
            createChange.mockRejectedValue(forbidden())

            await expect(run("ai_change_start", { microfrontendId: MICROFRONTEND, prompt: "Add a footer" })).rejects.toMatchObject({ code: "AI_CHANGE_FORBIDDEN" })
        })
    })

    describe("ai_changes_list", () => {
        it("given a microfrontend, when listed, then each change is a view", async () => {
            listChanges.mockResolvedValue([changeDocument("PROPOSED")])

            expect(await run("ai_changes_list", { microfrontendId: MICROFRONTEND })).toEqual([expect.objectContaining({ id: CHANGE, status: "PROPOSED" })])
            expect(listChanges).toHaveBeenCalledWith({ kind: "microfrontend", id: MICROFRONTEND })
        })

        it("given a service, when listed, then the changes of the service are", async () => {
            listChanges.mockResolvedValue([])

            await run("ai_changes_list", { serviceId: SERVICE })

            expect(listChanges).toHaveBeenCalledWith({ kind: "service", id: SERVICE })
            expect(tool("ai_changes_list").inputSchema.safeParse({}).success).toBe(false)
        })

        it("given changes read without their progress, when listed, then the view has no progress rather than an empty one", async () => {
            const { events: _events, ...withoutEvents } = changeDocument("PROPOSED")
            listChanges.mockResolvedValue([withoutEvents])

            const [change] = (await run("ai_changes_list", { microfrontendId: MICROFRONTEND })) as Record<string, unknown>[]

            expect(change).not.toHaveProperty("recentEvents")
        })

        it("given a microfrontend of another project, when listed, then the refusal surfaces", async () => {
            listChanges.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("ai_changes_list", { microfrontendId: MICROFRONTEND })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("ai_change_get", () => {
        it("given a change, when read, then its status and files are returned", async () => {
            getChange.mockResolvedValue(changeDocument("PROPOSED"))

            expect(await run("ai_change_get", { changeId: CHANGE })).toMatchObject({ id: CHANGE, status: "PROPOSED", summary: "Adds a footer" })
            expect(getChange).toHaveBeenCalledWith(CHANGE)
        })

        it("given a change of another project, when read, then the refusal surfaces", async () => {
            getChange.mockRejectedValue(new UserCannotAccessThisProjectError())

            await expect(run("ai_change_get", { changeId: CHANGE })).rejects.toBeInstanceOf(UserCannotAccessThisProjectError)
        })
    })

    describe("ai_change_apply", () => {
        it("given a proposal, when applied, then the whole change reaches the service and its commit on the base comes back", async () => {
            applyChange.mockResolvedValue({ ...changeDocument("APPLIED"), commit: "abc123" })

            const result = await run("ai_change_apply", { changeId: CHANGE })

            expect(applyChange).toHaveBeenCalledWith(CHANGE)
            expect(result).toMatchObject({ status: "APPLIED", commit: "abc123" })
        })

        it("given a viewer, when applied, then the service's refusal surfaces", async () => {
            applyChange.mockRejectedValue(forbidden())

            await expect(run("ai_change_apply", { changeId: CHANGE })).rejects.toMatchObject({ code: "AI_CHANGE_FORBIDDEN" })
        })
    })

    describe("ai_change_open_pull_request", () => {
        it("given a proposal, when a pull request is opened, then the assistant asks first and the pull request comes back with the change still proposed", async () => {
            openPullRequest.mockResolvedValue({ ...changeDocument("PROPOSED"), branch: "ai/cart-20261020-090000", pullRequestUrl: "https://github.com/acme/cart/pull/7" })

            const result = await run("ai_change_open_pull_request", { changeId: CHANGE })

            expect(tool("ai_change_open_pull_request").requiresConfirmation).toBe(true)
            expect(openPullRequest).toHaveBeenCalledWith(CHANGE)
            expect(result).toMatchObject({ status: "PROPOSED", branch: "ai/cart-20261020-090000", pullRequestUrl: "https://github.com/acme/cart/pull/7" })
        })
    })

    describe("ai_change_discard", () => {
        it("given a proposal, when discarded, then the discarded change is returned", async () => {
            discardChange.mockResolvedValue(changeDocument("DISCARDED"))

            expect(await run("ai_change_discard", { changeId: CHANGE })).toMatchObject({ status: "DISCARDED" })
            expect(discardChange).toHaveBeenCalledWith(CHANGE)
        })

        it("given a change that is not a proposal, when discarded, then the service's refusal surfaces", async () => {
            discardChange.mockRejectedValue(createBusinessException({ code: "AI_CHANGE_NOT_PROPOSED", message: "Only a proposal can be discarded", statusCode: 409 }))

            await expect(run("ai_change_discard", { changeId: CHANGE })).rejects.toMatchObject({ code: "AI_CHANGE_NOT_PROPOSED" })
        })
    })

    describe("ai_job_start", () => {
        it("given services and base branches, when started, then the job is a selection of them starting from those branches", async () => {
            createJob.mockResolvedValue(jobView("PENDING"))

            await run("ai_job_start", { prompt: "Rename the price API", microfrontendIds: [MICROFRONTEND], serviceIds: [SERVICE], baseBranches: { [SERVICE]: "develop" } })

            expect(createJob).toHaveBeenCalledWith(
                PROJECT,
                expect.objectContaining({ scope: "selection", microfrontendIds: [MICROFRONTEND], serviceIds: [SERVICE], baseBranches: { [SERVICE]: "develop" } })
            )
        })

        it("given a domain with services, when the input is validated, then it is refused", () => {
            expect(tool("ai_job_start").inputSchema.safeParse({ prompt: "Rename", domainId: PROJECT, serviceIds: [SERVICE] }).success).toBe(false)
        })

        it("given no microfrontend, when started, then the job is global on the tool's project and the view carries its id, usage and repositories", async () => {
            createJob.mockResolvedValue(jobView("PENDING"))

            const result = (await run("ai_job_start", { prompt: "Rename the price API" })) as Record<string, unknown>

            expect(createJob).toHaveBeenCalledWith(PROJECT, { prompt: "Rename the price API", scope: "global" })
            expect(result).toMatchObject({
                jobId: JOB,
                status: "PENDING",
                usage: { inputTokens: 1200, cachedInputTokens: 800, outputTokens: 300 },
                repositories: [
                    { changeId: CHANGE, kind: "microfrontend", microfrontendId: MICROFRONTEND, microfrontend: "Cart", status: "PROPOSED", files: [{ path: "src/Price.ts", action: "update" }] }
                ]
            })
            expect(result.recentEvents).toHaveLength(10)
        })

        /** A global job takes the services too: their id must not read as a microfrontend's */
        it("given a job on a service, when it is viewed, then the repository is named a service with its serviceId", async () => {
            const view = jobView("PENDING")
            createJob.mockResolvedValue({ ...view, repositories: [{ ...view.repositories[0], kind: "service", microfrontendName: "Orders API", microfrontendSlug: "orders-api" }] })

            const result = (await run("ai_job_start", { prompt: "Rename the price API" })) as { repositories: Record<string, unknown>[] }

            expect(result.repositories[0]).toMatchObject({ kind: "service", serviceId: MICROFRONTEND, service: "Orders API" })
            expect(result.repositories[0]).not.toHaveProperty("microfrontendId")
            expect(result.repositories[0]).not.toHaveProperty("microfrontend")
        })

        it("given microfrontends, when started, then the job works on those alone", async () => {
            createJob.mockResolvedValue(jobView("PENDING"))

            await run("ai_job_start", { prompt: "Rename the price API", microfrontendIds: [MICROFRONTEND] })

            expect(createJob).toHaveBeenCalledWith(PROJECT, { prompt: "Rename the price API", scope: "selection", microfrontendIds: [MICROFRONTEND] })
        })

        it("given more than 10 microfrontends, when the input is validated, then it is refused", () => {
            expect(tool("ai_job_start").inputSchema.safeParse({ prompt: "x", microfrontendIds: Array.from({ length: 11 }, () => MICROFRONTEND) }).success).toBe(false)
        })
    })

    describe("ai_job_follow_up", () => {
        it("given a finished job, when followed up, then the child job comes back with its own id", async () => {
            followUpJob.mockResolvedValue({ ...jobView("PENDING"), _id: CHANGE, parentJobId: JOB })

            const result = await run("ai_job_follow_up", { jobId: JOB, prompt: "Also rename the tests" })

            expect(followUpJob).toHaveBeenCalledWith(JOB, { prompt: "Also rename the tests", microfrontendIds: undefined })
            expect(result).toMatchObject({ jobId: CHANGE, parentJobId: JOB, rootJobId: JOB })
        })

        it("given a job still running, when followed up, then the service's refusal surfaces", async () => {
            followUpJob.mockRejectedValue(createBusinessException({ code: "AI_JOB_NOT_DONE", message: "The job has not finished yet", statusCode: 409 }))

            await expect(run("ai_job_follow_up", { jobId: JOB, prompt: "Also rename the tests" })).rejects.toMatchObject({ code: "AI_JOB_NOT_DONE" })
        })
    })

    describe("AI models", () => {
        it("given the tool's project, when its AIs are listed, then they come with the default", async () => {
            const available = { models: [{ id: "system", name: "System", provider: "anthropic", model: "claude-opus-5-5", system: true, isDefault: false, efforts: ["low"] }], defaultId: "system" }
            availableForProject.mockResolvedValue(available)

            expect(await run("ai_models_list", {})).toEqual(available)
            expect(availableForProject).toHaveBeenCalledWith(PROJECT)
            expect(tool("ai_models_list").annotations).toMatchObject({ readOnlyHint: true })
        })

        it("given an AI, when a change, a job or a follow-up is started, then it reaches the service and the views carry the AI used", async () => {
            createChange.mockResolvedValue({ ...changeDocument("PENDING"), aiModelId: "system" })
            createJob.mockResolvedValue({ ...jobView("PENDING"), aiModelId: "system" })
            followUpJob.mockResolvedValue({ ...jobView("PENDING"), aiModelId: "system" })

            const change = await run("ai_change_start", { microfrontendId: MICROFRONTEND, prompt: "Add a footer", aiModelId: "system" })
            const job = await run("ai_job_start", { prompt: "Rename the price API", aiModelId: "system" })
            const followUp = await run("ai_job_follow_up", { jobId: JOB, prompt: "Also rename the tests", aiModelId: "system" })

            expect(createChange).toHaveBeenCalledWith({ kind: "microfrontend", id: MICROFRONTEND }, expect.objectContaining({ aiModelId: "system" }))
            expect(createJob).toHaveBeenCalledWith(PROJECT, { prompt: "Rename the price API", scope: "global", aiModelId: "system" })
            expect(followUpJob).toHaveBeenCalledWith(JOB, expect.objectContaining({ aiModelId: "system" }))
            expect([change, job, followUp].map(view => (view as { aiModelId?: string }).aiModelId)).toEqual(["system", "system", "system"])
        })
    })

    describe("effort", () => {
        it("given an effort, when a change, a job or a follow-up is started, then it reaches the service and the views carry the effort used", async () => {
            createChange.mockResolvedValue({ ...changeDocument("PENDING"), effort: "low" })
            createJob.mockResolvedValue({ ...jobView("PENDING"), effort: "xhigh" })
            followUpJob.mockResolvedValue({ ...jobView("PENDING"), effort: "max" })

            const change = await run("ai_change_start", { microfrontendId: MICROFRONTEND, prompt: "Add a footer", effort: "low" })
            const job = await run("ai_job_start", { prompt: "Rename the price API", domainId: PROJECT, effort: "xhigh" })
            const followUp = await run("ai_job_follow_up", { jobId: JOB, prompt: "Also rename the tests", effort: "max" })

            expect(createChange).toHaveBeenCalledWith({ kind: "microfrontend", id: MICROFRONTEND }, expect.objectContaining({ effort: "low" }))
            expect(createJob).toHaveBeenCalledWith(PROJECT, { prompt: "Rename the price API", scope: "domain", domainId: PROJECT, effort: "xhigh" })
            expect(followUpJob).toHaveBeenCalledWith(JOB, expect.objectContaining({ effort: "max" }))
            expect([change, job, followUp]).toEqual([expect.objectContaining({ effort: "low" }), expect.objectContaining({ effort: "xhigh" }), expect.objectContaining({ effort: "max" })])
        })

        it("given a level that does not exist, when the input is validated, then it is refused", () => {
            expect(tool("ai_job_start").inputSchema.safeParse({ prompt: "x", effort: "turbo" }).success).toBe(false)
        })

        it("given progress with the agent's reasoning, when viewed, then the reasoning is left out and the latest steps fill the view", async () => {
            const events = Array.from({ length: 12 }, (_, index) => [
                { at: new Date(0), kind: "tool", message: `step ${index}` },
                { at: new Date(0), kind: "thinking", message: "x".repeat(1_000) }
            ]).flat()
            getChange.mockResolvedValue({ ...changeDocument("RUNNING"), events })
            getJob.mockResolvedValue({ ...jobView("RUNNING"), events })

            const change = (await run("ai_change_get", { changeId: CHANGE })) as { recentEvents: { kind: string; message: string }[] }
            const job = (await run("ai_job_get", { jobId: JOB })) as { recentEvents: { kind: string; message: string }[] }

            for (const view of [change, job]) {
                expect(view.recentEvents.map(entry => entry.message)).toEqual(Array.from({ length: 10 }, (_, index) => `step ${index + 2}`))
            }
        })
    })

    describe("ai_job_get and ai_job_apply", () => {
        it("given a job, when read, then its status and usage are returned", async () => {
            getJob.mockResolvedValue(jobView("DONE"))

            expect(await run("ai_job_get", { jobId: JOB })).toMatchObject({ jobId: JOB, status: "DONE", usage: { outputTokens: 300 } })
            expect(getJob).toHaveBeenCalledWith(JOB)
        })

        it("given a finished job, when applied, then the job comes back with its pull requests", async () => {
            applyJob.mockResolvedValue({ ...jobView("DONE"), repositories: [{ ...jobView("DONE").repositories[0], status: "APPLIED", pullRequestUrl: "https://github.com/acme/cart/pull/7" }] })

            const result = await run("ai_job_apply", { jobId: JOB })

            expect(applyJob).toHaveBeenCalledWith(JOB)
            expect(result).toMatchObject({ jobId: JOB, repositories: [{ status: "APPLIED", pullRequestUrl: "https://github.com/acme/cart/pull/7" }] })
        })
    })

    describe("ai_jobs_list", () => {
        it("given active, when listed, then the caller's active jobs of the project come back without progress", async () => {
            const { events: _events, ...withoutEvents } = jobView("RUNNING")
            listJobs.mockResolvedValue([withoutEvents])

            const [job] = (await run("ai_jobs_list", { active: true })) as Record<string, unknown>[]

            expect(listJobs).toHaveBeenCalledWith(PROJECT, true)
            expect(job).toMatchObject({ jobId: JOB, status: "RUNNING" })
            expect(job).not.toHaveProperty("recentEvents")
        })
    })

    describe("ai_domain_plan", () => {
        it("given a domain and a request, when planned, then the plan comes back and nothing is written", async () => {
            const plan = { microfrontends: [{ name: "Orders", slug: "orders", template: "vite-react", repositoryName: "orders-fe" }], services: [] }
            planDomain.mockResolvedValue(plan)

            expect(await run("ai_domain_plan", { domainId: MICROFRONTEND, prompt: "Track orders" })).toEqual(plan)
            expect(planDomain).toHaveBeenCalledWith(PROJECT, { domainId: MICROFRONTEND, prompt: "Track orders" })
            expect(tool("ai_domain_plan").annotations).toMatchObject({ destructiveHint: false })
        })
    })
})
