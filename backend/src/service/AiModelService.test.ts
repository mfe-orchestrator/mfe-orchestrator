import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AiModel, { IAiModel } from "../models/AiModelModel"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { RoleInOrganization } from "../models/UserOrganizationModel"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import AiModelService, { AiModelDetail, settingsOf } from "./AiModelService"
import BaseAuthorizedService from "./BaseAuthorizedService"
import { getLlmClient, LlmConfiguration } from "./llm"

const ORGANIZATION_ID = new Types.ObjectId().toString()
const PROJECT_ID = new Types.ObjectId().toString()
const SYSTEM: LlmConfiguration = { ANTHROPIC_API_KEY: "sk-system" }

const user = { _id: new Types.ObjectId(), email: "ada@example.com" } as unknown as IUser

/** A stored AI, as mongoose hands it back from a find. */
const stored = (fields: Partial<Omit<IAiModel, "_id">> & { name: string }) =>
    AiModel.hydrate({
        _id: new Types.ObjectId(),
        organizationId: ORGANIZATION_ID,
        provider: "anthropic",
        config: { apiKey: "sk-org" },
        isDefault: false,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        ...fields
    })

/** What a query of mongoose answers to: awaited, or narrowed to a session first. */
const thenable = <T>(value: T) => ({
    session: () => thenable(value),
    lean: () => Promise.resolve(value),
    then: (resolve: (value: T) => unknown) => resolve(value)
})

/** The body of a refusal: its code and its details. */
const refusalOf = async (promise: Promise<unknown>) => {
    try {
        await promise
        return undefined
    } catch (error) {
        return { code: (error as { code?: string }).code, details: (error as { details?: unknown }).details }
    }
}

const codeOf = async (promise: Promise<unknown>) => {
    try {
        await promise
        return "no error"
    } catch (error) {
        return (error as { code?: string }).code ?? (error as Error).name
    }
}

describe("AiModelService", () => {
    let role: RoleInOrganization | undefined
    let models: IAiModel[]
    let project: { _id: string; organizationId: string; name: string; aiModelIds?: string[] }
    let projectUpdates: { filter: Record<string, unknown>; update: Record<string, unknown> }[]
    let modelUpdates: { filter: Record<string, unknown>; update: Record<string, unknown> }[]
    let saved: IAiModel[]

    beforeEach(() => {
        role = RoleInOrganization.ADMIN
        models = []
        project = { _id: PROJECT_ID, organizationId: ORGANIZATION_ID, name: "Shop" }
        projectUpdates = []
        modelUpdates = []
        saved = []
        vi.spyOn(UserOrganization, "findOne").mockImplementation((() => thenable(role ? { role } : null)) as never)
        vi.spyOn(BaseAuthorizedService.prototype as unknown as { hasAccessToProject: () => Promise<boolean> }, "hasAccessToProject").mockResolvedValue(true)
        vi.spyOn(AiModel, "find").mockImplementation((() => Promise.resolve(models)) as never)
        vi.spyOn(AiModel, "findOne").mockImplementation(((filter: { _id: unknown }) => Promise.resolve(models.find(model => String(model._id) === String(filter._id)) ?? null)) as never)
        vi.spyOn(AiModel, "updateMany").mockImplementation(((filter: Record<string, unknown>, update: Record<string, unknown>) => {
            modelUpdates.push({ filter, update })
            return Promise.resolve({})
        }) as never)
        vi.spyOn(AiModel, "deleteOne").mockResolvedValue({ deletedCount: 1 } as never)
        // As the unique index compares them: case-insensitively, the AI being renamed left out
        vi.spyOn(AiModel, "exists").mockImplementation(((filter: { name: string; _id?: { $ne: unknown } }) => ({
            collation: () => Promise.resolve(models.find(model => model.name.toLowerCase() === filter.name.toLowerCase() && String(model._id) !== String(filter._id?.$ne)) ? { _id: "taken" } : null)
        })) as never)
        vi.spyOn(AiModel.prototype, "save").mockImplementation(function (this: IAiModel) {
            saved.push(this)
            return Promise.resolve(this) as never
        })
        vi.spyOn(Project, "findById").mockImplementation((() => Promise.resolve(project)) as never)
        vi.spyOn(Project, "find").mockImplementation((() =>
            Promise.resolve([
                { _id: "p2", name: "zeta", aiModelIds: [] },
                { _id: "p1", name: "Alpha" }
            ])) as never)
        const recordProjectUpdate = (filter: Record<string, unknown>, update: Record<string, unknown>) => {
            projectUpdates.push({ filter, update })
            return Promise.resolve({})
        }
        vi.spyOn(Project, "updateOne").mockImplementation(recordProjectUpdate as never)
        vi.spyOn(Project, "updateMany").mockImplementation(recordProjectUpdate as never)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const service = (config: LlmConfiguration = SYSTEM) => new AiModelService(user, config)

    describe("which AI answers", () => {
        it("Given an AI marked as default, when nothing is chosen, then it answers; the system AI comes last in the list", async () => {
            const opus = stored({ name: "Opus", isDefault: true })
            models = [opus, stored({ name: "Gemini", provider: "gemini" as never, modelId: "gemini-x", config: { apiKey: "g" } })]

            const available = await service().availableForProject(PROJECT_ID)

            expect(available.models.map(model => model.name)).toEqual(["Gemini", "Opus", "System"])
            expect(available.models.map(model => model.system)).toEqual([false, false, true])
            expect(available.defaultId).toBe(String(opus._id))
            expect((await service().resolveForProject(PROJECT_ID)).settings.id).toBe(String(opus._id))
        })

        it("Given no AI marked as default, when nothing is chosen, then the first by name answers", async () => {
            const beta = stored({ name: "beta" })
            models = [stored({ name: "Gamma" }), beta]

            expect((await service().availableForProject(PROJECT_ID)).defaultId).toBe(String(beta._id))
        })

        it("Given a default the project may not use, when nothing is chosen, then the first it may use answers", async () => {
            models = [stored({ name: "Opus", isDefault: true })]
            project.aiModelIds = ["system"]

            const available = await service().availableForProject(PROJECT_ID)

            expect(available).toEqual({ models: [expect.objectContaining({ id: "system", system: true })], defaultId: "system" })
        })

        it("Given an AI the project may not use, when it is asked for, then it is refused", async () => {
            const opus = stored({ name: "Opus" })
            models = [opus]
            project.aiModelIds = ["system"]

            expect(await codeOf(service().resolveForProject(PROJECT_ID, String(opus._id)))).toBe("AI_MODEL_NOT_AVAILABLE")
        })

        it("Given a project restricted to an empty list, then it has no AI and asking answers as AI off", async () => {
            models = [stored({ name: "Opus" })]
            project.aiModelIds = []

            expect(await service().availableForProject(PROJECT_ID)).toEqual({ models: [], defaultId: undefined })
            expect(await codeOf(service().resolveForProject(PROJECT_ID))).toBe("ASSISTANT_DISABLED")
        })

        it("Given a project without a restriction, then every AI of the organization is available, the ones added later too", async () => {
            models = [stored({ name: "Opus" })]

            expect((await service().availableForProject(PROJECT_ID)).models).toHaveLength(2)

            models.push(stored({ name: "Sonnet" }))
            expect((await service().availableForProject(PROJECT_ID)).models).toHaveLength(3)
        })

        it("Given neither AIs of the organization nor a system AI, then asking answers as AI off", async () => {
            expect(await codeOf(service({}).resolveForProject(PROJECT_ID))).toBe("ASSISTANT_DISABLED")
        })

        it("Given a preferred AI still available, when nothing is chosen, then it answers instead of the default", async () => {
            const sonnet = stored({ name: "Sonnet" })
            models = [stored({ name: "Opus", isDefault: true }), sonnet]

            expect((await service().resolveForProject(PROJECT_ID, undefined, String(sonnet._id))).settings.id).toBe(String(sonnet._id))
            expect((await service().resolveForProject(PROJECT_ID, undefined, "deleted-since")).settings.name).toBe("Opus")
        })

        it("Given the wizard of an organization, then its AIs are available to a member", async () => {
            role = RoleInOrganization.MEMBER
            models = [stored({ name: "Opus", isDefault: true })]

            expect((await service().availableForOrganization(ORGANIZATION_ID)).defaultId).toBe(String(models[0]._id))
            expect((await service().resolveForOrganization(ORGANIZATION_ID, "system")).settings.id).toBe("system")
        })

        it("Given someone outside the organization, then they cannot draft with its AIs", async () => {
            role = undefined

            expect(await codeOf(service().resolveForOrganization(ORGANIZATION_ID))).toBe("UserCannotAccessThisOrganizationError")
        })
    })

    describe("list", () => {
        it("Given a member, then the AIs come without how they are reached", async () => {
            role = RoleInOrganization.MEMBER
            models = [stored({ name: "Opus", maxEffort: "high" })]

            const list = await service().list(ORGANIZATION_ID)

            expect(list[0]).toEqual({ id: String(models[0]._id), name: "Opus", provider: "anthropic", model: "claude-opus-5-5", system: false, isDefault: false, efforts: ["low", "medium", "high"] })
            expect(list[1]).not.toHaveProperty("config")
        })

        it("Given an administrator, then the configuration comes too, with every credential as the placeholder", async () => {
            models = [stored({ name: "Bedrock", provider: "aws-bedrock" as never, modelId: "anthropic.claude-opus-5-5", config: { region: "eu-west-1", accessKeyId: "AKIA", secretAccessKey: "s" } })]

            const [bedrock] = (await service().list(ORGANIZATION_ID)) as AiModelDetail[]

            expect(bedrock.config).toEqual({ region: "eu-west-1", accessKeyId: "AKIA", secretAccessKey: SECRET_PLACEHOLDER })
            expect(bedrock.createdAt).toEqual(new Date(0))
        })

        /** The system AI is the installation's: how it is reached is nobody's business in an organization. */
        it("Given an administrator, then the system AI still comes as a summary, without its configuration", async () => {
            const [system] = await service().list(ORGANIZATION_ID)

            expect(system).toEqual({
                id: "system",
                name: "System",
                provider: "anthropic",
                model: "claude-opus-5-5",
                system: true,
                isDefault: false,
                efforts: ["low", "medium", "high", "xhigh", "max"]
            })
        })
    })

    describe("create", () => {
        it("Given a plain member, when they add an AI, then it is refused", async () => {
            role = RoleInOrganization.MEMBER

            expect(await codeOf(service().create(ORGANIZATION_ID, { name: "Opus", provider: "anthropic" as never, config: { apiKey: "k" } }))).toBe("UserCannotAccessThisOrganizationError")
            expect(saved).toHaveLength(0)
        })

        it("Given an AI marked as default, when it is added, then the others of the organization are no longer the default", async () => {
            const created = await service().create(ORGANIZATION_ID, { name: " Opus ", provider: "anthropic" as never, config: { apiKey: "k", region: "ignored" } as never, isDefault: true })

            expect(created).toMatchObject({ name: "Opus", model: "claude-opus-5-5", isDefault: true, config: { apiKey: SECRET_PLACEHOLDER } })
            // What the provider does not read is not stored
            expect(saved[0].config).toEqual({ apiKey: "k" })
            expect(modelUpdates).toEqual([{ filter: { organizationId: ORGANIZATION_ID, _id: { $ne: saved[0]._id }, isDefault: true }, update: { isDefault: false } }])
        })

        it("Given two AIs made the default at the same time, when the unique index refuses the second, then it is a conflict, not a name taken", async () => {
            vi.spyOn(AiModel.prototype, "save").mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000, keyPattern: { organizationId: 1, isDefault: 1 } }))
            expect(await codeOf(service().create(ORGANIZATION_ID, { name: "Opus", provider: "anthropic" as never, config: { apiKey: "k" }, isDefault: true }))).toBe("AI_MODEL_DEFAULT_CONFLICT")

            vi.spyOn(AiModel.prototype, "save").mockRejectedValueOnce(Object.assign(new Error("E11000"), { code: 11000, keyPattern: { organizationId: 1, name: 1 } }))
            expect(await codeOf(service().create(ORGANIZATION_ID, { name: "Opus", provider: "anthropic" as never, config: { apiKey: "k" } }))).toBe("AI_MODEL_NAME_TAKEN")
        })

        it("Given a name already used with another case, when an AI is added, then it is refused", async () => {
            models = [stored({ name: "Opus" })]

            expect(await codeOf(service().create(ORGANIZATION_ID, { name: "OPUS", provider: "anthropic" as never, config: { apiKey: "k" } }))).toBe("AI_MODEL_NAME_TAKEN")
        })

        it.each([
            ["a Bedrock AI without its model", { provider: "aws-bedrock", config: { region: "eu-west-1", accessKeyId: "AKIA", secretAccessKey: "s" } }, { field: "model" }],
            ["a Bedrock AI without anything", { provider: "aws-bedrock", config: {} }, { field: "model", missing: ["model", "config.region", "config.accessKeyId", "config.secretAccessKey"] }],
            ["an Azure OpenAI AI without its endpoint", { provider: "azure-openai", model: "gpt", config: { apiKey: "k" } }, { field: "config.endpoint" }],
            ["a region that is not one", { provider: "aws-bedrock", model: "m", config: { region: "evil.example.com/", accessKeyId: "AKIA", secretAccessKey: "s" } }, { field: "config.region" }],
            ["a resource that is a URL", { provider: "azure-foundry", config: { resource: "https://evil.example.com", apiKey: "k" } }, { field: "config.resource" }],
            ["the placeholder on a new AI", { provider: "anthropic", config: { apiKey: SECRET_PLACEHOLDER } }, { field: "config.apiKey", reason: "secret_required" }],
            ["no name", { name: " ", provider: "anthropic", config: { apiKey: "k" } }, { field: "name" }]
        ])("Given %s, when it is added, then it is invalid and says which field", async (_case, input, details) => {
            expect(await refusalOf(service().create(ORGANIZATION_ID, { name: "AI", ...(input as object) } as never))).toEqual({ code: "AI_MODEL_INVALID", details })
            expect(saved).toHaveLength(0)
        })

        /** The server sends the key to the endpoint and relays what comes back: only Azure hosts, exactly. */
        it.each([
            "http://a.openai.azure.com/",
            "https://10.0.0.1/",
            "https://[::1]/",
            "https://kubernetes.default.svc/",
            "https://user:pass@a.openai.azure.com/",
            "https://a.openai.azure.com:8443/",
            "https://a.openai.azure.com/openai/deployments",
            "https://a.openai.azure.com/?next=http://10.0.0.1",
            "https://openai.azure.com.evil.example.com/",
            "https://.openai.azure.com/",
            "not a url"
        ])("Given the endpoint %s, when an Azure OpenAI AI is added, then it is refused", async endpoint => {
            expect(await refusalOf(service().create(ORGANIZATION_ID, { name: "GPT", provider: "azure-openai" as never, model: "gpt", config: { endpoint, apiKey: "k" } }))).toEqual({
                code: "AI_MODEL_INVALID",
                details: { field: "config.endpoint" }
            })
        })

        it.each(["https://a.openai.azure.com/", "https://a.openai.azure.com", "https://a.cognitiveservices.azure.com:443/", "https://a.services.ai.azure.com/"])(
            "Given the Azure endpoint %s, when an Azure OpenAI AI is added, then it is accepted",
            async endpoint => {
                expect(await codeOf(service().create(ORGANIZATION_ID, { name: "GPT", provider: "azure-openai" as never, model: "gpt", config: { endpoint, apiKey: "k" } }))).toBe("no error")
            }
        )

        it("Given a sovereign cloud suffix configured by the installation, when its endpoint is used, then it is accepted, and only then", async () => {
            const input = { name: "GPT", provider: "azure-openai" as never, model: "gpt", config: { endpoint: "https://a.openai.azure.us/", apiKey: "k" } }

            expect(await codeOf(service().create(ORGANIZATION_ID, input))).toBe("AI_MODEL_INVALID")
            expect(await codeOf(service({ ...SYSTEM, AZURE_OPENAI_ENDPOINT_SUFFIXES: "openai.azure.us, .openai.azure.cn" }).create(ORGANIZATION_ID, input))).toBe("no error")
        })
    })

    describe("update", () => {
        it("Given the placeholder sent back, when the AI is saved, then the stored credential is kept", async () => {
            const azure = stored({ name: "GPT", provider: "azure-openai" as never, modelId: "gpt", config: { endpoint: "https://a.openai.azure.com/", apiKey: "the-real-key" } })
            models = [azure]

            await service().update(ORGANIZATION_ID, String(azure._id), {
                name: "GPT",
                provider: "azure-openai" as never,
                model: "gpt-6",
                config: { endpoint: "https://a.openai.azure.com/", apiKey: SECRET_PLACEHOLDER, reasoning: true },
                maxEffort: null,
                isDefault: false
            })

            expect(saved[0].config).toEqual({ endpoint: "https://a.openai.azure.com/", apiKey: "the-real-key", reasoning: true })
            expect(saved[0].modelId).toBe("gpt-6")
        })

        /** The key belongs to its endpoint: lent to another one, it would be sent to whoever owns that. */
        it("Given another endpoint, when the placeholder is sent back, then the key has to be typed again", async () => {
            const azure = stored({ name: "GPT", provider: "azure-openai" as never, modelId: "gpt", config: { endpoint: "https://a.openai.azure.com/", apiKey: "the-real-key" } })
            models = [azure]

            expect(await refusalOf(service().update(ORGANIZATION_ID, String(azure._id), { config: { endpoint: "https://b.openai.azure.com/", apiKey: SECRET_PLACEHOLDER } }))).toEqual({
                code: "AI_MODEL_INVALID",
                details: { field: "config.apiKey", reason: "secret_required" }
            })
            expect(saved).toHaveLength(0)
        })

        it("Given only another provider, without a config, when the AI is saved, then the stored keys are not reused and have to be typed", async () => {
            const opus = stored({ name: "Opus" })
            models = [opus]

            expect(await refusalOf(service().update(ORGANIZATION_ID, String(opus._id), { provider: "gemini" as never, model: "gemini-x" }))).toEqual({
                code: "AI_MODEL_INVALID",
                details: { field: "config.apiKey", reason: "secret_required" }
            })
            expect(
                await refusalOf(
                    service().update(ORGANIZATION_ID, String(opus._id), {
                        provider: "aws-bedrock" as never,
                        model: "m",
                        config: { region: "eu-west-1", accessKeyId: "AKIA", secretAccessKey: SECRET_PLACEHOLDER }
                    })
                )
            ).toEqual({ code: "AI_MODEL_INVALID", details: { field: "config.secretAccessKey", reason: "secret_required" } })
            expect(saved).toHaveLength(0)
        })

        it("Given another provider with new keys, when the AI is saved, then they are stored", async () => {
            const opus = stored({ name: "Opus" })
            models = [opus]

            await service().update(ORGANIZATION_ID, String(opus._id), { provider: "gemini" as never, model: "gemini-x", config: { apiKey: "g-new" } })

            expect(saved[0].config).toEqual({ apiKey: "g-new" })
        })

        it("Given a null maxEffort, when the AI is saved, then the cap is removed", async () => {
            const opus = stored({ name: "Opus", maxEffort: "low" })
            models = [opus]

            const updated = await service().update(ORGANIZATION_ID, String(opus._id), { maxEffort: null })

            expect(saved[0].maxEffort).toBeUndefined()
            expect(updated.efforts).toEqual(["low", "medium", "high", "xhigh", "max"])
        })

        it("Given the system AI, when it is edited or deleted, then it is refused as read-only", async () => {
            expect(await codeOf(service().update(ORGANIZATION_ID, "system", { name: "Mine" }))).toBe("AI_MODEL_SYSTEM_READONLY")
            expect(await codeOf(service().delete(ORGANIZATION_ID, "system"))).toBe("AI_MODEL_SYSTEM_READONLY")
        })

        it("Given another AI with the name, when an AI is renamed to it, then it is refused", async () => {
            const opus = stored({ name: "Opus" })
            models = [opus, stored({ name: "Sonnet" })]

            expect(await codeOf(service().update(ORGANIZATION_ID, String(opus._id), { name: "sonnet" }))).toBe("AI_MODEL_NAME_TAKEN")
            expect(await codeOf(service().update(ORGANIZATION_ID, String(opus._id), { name: "OPUS" }))).toBe("no error")
        })

        it("Given a plain member, when they edit an AI, then it is refused", async () => {
            role = RoleInOrganization.MEMBER
            const opus = stored({ name: "Opus" })
            models = [opus]

            expect(await codeOf(service().update(ORGANIZATION_ID, String(opus._id), { name: "Mine" }))).toBe("UserCannotAccessThisOrganizationError")
        })
    })

    describe("delete", () => {
        it("Given an AI some projects are restricted to, when it is deleted, then it is taken out of them", async () => {
            const opus = stored({ name: "Opus" })
            models = [opus]

            const before = getLlmClient(settingsOf(opus))

            await service().delete(ORGANIZATION_ID, String(opus._id))

            // The client built for it, and the key it holds, is gone with it
            expect(getLlmClient(settingsOf(opus))).not.toBe(before)
            expect(AiModel.deleteOne).toHaveBeenCalledWith({ _id: opus._id }, expect.anything())
            expect(projectUpdates).toEqual([{ filter: { organizationId: ORGANIZATION_ID, aiModelIds: String(opus._id) }, update: { $pull: { aiModelIds: String(opus._id) } } }])
        })

        it("Given a plain member, when they delete an AI, then it is refused and nothing is removed", async () => {
            role = RoleInOrganization.MEMBER
            const opus = stored({ name: "Opus" })
            models = [opus]

            expect(await codeOf(service().delete(ORGANIZATION_ID, String(opus._id)))).toBe("UserCannotAccessThisOrganizationError")
            expect(AiModel.deleteOne).not.toHaveBeenCalled()
        })
    })

    describe("access of the projects", () => {
        it("Given the organization's projects, then each says which AIs it may use, null for all of them", async () => {
            expect(await service().projectAccess(ORGANIZATION_ID)).toEqual([
                { projectId: "p1", name: "Alpha", aiModelIds: null },
                { projectId: "p2", name: "zeta", aiModelIds: [] }
            ])
        })

        it("Given AIs of the organization and the system one, when a project is restricted to them, then the list is saved without repeats", async () => {
            const opus = stored({ name: "Opus" })
            models = [opus]

            expect(await service().setProjectAccess(PROJECT_ID, [String(opus._id), "system", "system"])).toEqual({ aiModelIds: [String(opus._id), "system"] })
            expect(projectUpdates).toEqual([{ filter: { _id: PROJECT_ID }, update: { $set: { aiModelIds: [String(opus._id), "system"] } } }])
        })

        it("Given null, when it is saved, then the project gets every AI back", async () => {
            expect(await service().setProjectAccess(PROJECT_ID, null)).toEqual({ aiModelIds: null })
            expect(projectUpdates).toEqual([{ filter: { _id: PROJECT_ID }, update: { $unset: { aiModelIds: 1 } } }])
        })

        it("Given an AI of no organization, or the system one where the installation has none, then the restriction is refused", async () => {
            expect(await codeOf(service().setProjectAccess(PROJECT_ID, [new Types.ObjectId().toString()]))).toBe("AI_MODEL_NOT_AVAILABLE")
            expect(await codeOf(service({}).setProjectAccess(PROJECT_ID, ["system"]))).toBe("AI_MODEL_NOT_AVAILABLE")
            expect(projectUpdates).toHaveLength(0)
        })

        it("Given a plain member of the organization, when they restrict a project, then it is refused", async () => {
            role = RoleInOrganization.MEMBER

            expect(await codeOf(service().setProjectAccess(PROJECT_ID, ["system"]))).toBe("UserCannotAccessThisOrganizationError")
            expect(await codeOf(service().projectAccess(ORGANIZATION_ID))).toBe("UserCannotAccessThisOrganizationError")
        })
    })
})
