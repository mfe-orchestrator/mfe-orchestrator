import { Types } from "mongoose"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import Microfrontend, { MicrofrontendType } from "../models/MicrofrontendModel"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource } from "../types/MicrofrontendStack"
import FederationIntegrationService, { FederationIntegrationStatus } from "./FederationIntegrationService"
import RepositoryFileService, { RepositoryTarget } from "./RepositoryFileService"

const projectId = new Types.ObjectId()

const microfrontendOf = (slug: string, compiler: MicrofrontendCompiler, parentIds: Types.ObjectId[] = []) => ({
    _id: new Types.ObjectId(),
    slug,
    name: slug,
    projectId,
    type: parentIds.length > 0 ? MicrofrontendType.REMOTE : MicrofrontendType.HOST,
    parentIds,
    stack: { framework: MicrofrontendFramework.REACT, compiler, source: MicrofrontendStackSource.TEMPLATE }
})

/** A host with one remote, the host's repository holding these files */
const planWith = async (compiler: MicrofrontendCompiler, files: Record<string, string>) => {
    const host = microfrontendOf("shell", compiler)
    const remote = microfrontendOf("checkout-new", compiler, [host._id])
    const target = { microfrontend: host, codeRepository: { provider: CodeRepositoryProvider.GITHUB }, repositoryName: "shell" } as unknown as RepositoryTarget

    vi.spyOn(Microfrontend, "find").mockReturnValue({ sort: async () => [host, remote] } as never)
    vi.spyOn(RepositoryFileService.prototype, "resolveTargets").mockResolvedValue([target])
    vi.spyOn(RepositoryFileService.prototype, "getDefaultBranch").mockResolvedValue("main")
    vi.spyOn(RepositoryFileService.prototype, "readFile").mockImplementation(async (_target, path) => (path in files ? { raw: files[path] } : null))

    const plan = await new FederationIntegrationService().getPlan(projectId.toString())
    return plan.microfrontends[0]
}

const manifest = JSON.stringify({ dependencies: { react: "^19.3.1" }, devDependencies: { vite: "^8.3.4" } }, null, 2)

afterEach(() => {
    vi.restoreAllMocks()
})

describe("FederationIntegrationService plan, integration models", () => {
    it("given a single-spa root config with a remote, when the integration is planned, then it registers the remote in src/applications.ts", async () => {
        const item = await planWith(MicrofrontendCompiler.SINGLE_SPA, { "package.json": manifest, "vite.config.ts": "export default {}" })

        expect(item.status).toBe(FederationIntegrationStatus.CONFIG_TO_CREATE)
        expect(item.changes.map(change => change.path)).toEqual(["src/applications.ts", "package.json"])
        expect(item.changes[0].proposedContent).toContain("const url = await remoteUrl('checkout-new')")
        // The bundler config is not ours on this stack: it is never proposed for replacement
        expect(item.changes.some(change => change.path === "vite.config.ts")).toBe(false)
    })

    it("given a single-spa root config, when the integration is planned, then single-spa and the SDK are added as runtime dependencies", async () => {
        const item = await planWith(MicrofrontendCompiler.SINGLE_SPA, { "package.json": manifest })

        const proposed = JSON.parse(item.changes.find(change => change.path === "package.json")!.proposedContent)
        expect(proposed.dependencies).toMatchObject({ "single-spa": "latest", "@mfe-orchestrator-hub/client": "latest" })
        expect(proposed.devDependencies).toEqual({ vite: "^8.3.4" })
    })

    it("given a micro-lc shell with a remote, when the integration is planned, then it writes the runtime config builder and the micro-lc packages", async () => {
        const item = await planWith(MicrofrontendCompiler.MICRO_LC, { "package.json": manifest })

        expect(item.changes.map(change => change.path)).toEqual(["src/microlc-config.ts", "package.json"])
        expect(item.changes[0].proposedContent).toContain("entry: { scripts: [await remoteUrl('checkout-new')] }")
        const proposed = JSON.parse(item.changes[1].proposedContent)
        expect(proposed.dependencies).toMatchObject({ "@micro-lc/orchestrator": "latest", "@mfe-orchestrator-hub/client": "latest" })
        expect(proposed.devDependencies).toMatchObject({ "@micro-lc/interfaces": "latest" })
    })

    it("given a web component host, when the integration is planned, then it still integrates at runtime with nothing to write", async () => {
        const item = await planWith(MicrofrontendCompiler.WEBCOMPONENT, { "package.json": manifest })

        expect(item.status).toBe(FederationIntegrationStatus.RUNTIME_INTEGRATION)
        expect(item.changes).toEqual([])
    })
})
