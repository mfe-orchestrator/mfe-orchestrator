import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("..", () => ({
    fastify: { log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }, config: {} }
}))

import { MicrofrontendCompiler, MicrofrontendFramework } from "../types/MicrofrontendStack"
import RepositoryFileService, { RepositoryTarget } from "./RepositoryFileService"
import StackDetectionService from "./StackDetectionService"

const target = { repositoryName: "shell" } as RepositoryTarget

/** A repository holding exactly these files, path to content */
const repositoryWith = (files: Record<string, string>) =>
    vi.spyOn(RepositoryFileService.prototype, "readFile").mockImplementation(async (_target, path) => (path in files ? { raw: files[path] } : null))

const manifest = (dependencies: Record<string, string>, devDependencies: Record<string, string> = {}) => JSON.stringify({ dependencies, devDependencies })

afterEach(() => {
    vi.restoreAllMocks()
})

describe("StackDetectionService.detect", () => {
    it("given a single-spa root config built with Vite, when it is detected, then the integration model wins over the bundler", async () => {
        repositoryWith({
            "package.json": manifest({ "@mfe-orchestrator-hub/client": "^0.3.0", react: "^19.3.1", "single-spa": "^6.0.3" }, { vite: "^8.3.4" }),
            "vite.config.ts": "export default defineConfig({ plugins: [react(), sharedImportMap()] })"
        })

        const detected = await new StackDetectionService().detect(target, "main")

        expect(detected.framework).toBe(MicrofrontendFramework.REACT)
        expect(detected.compiler).toBe(MicrofrontendCompiler.SINGLE_SPA)
        expect(detected.configPath).toBe("vite.config.ts")
        expect(detected.clientPackageInstalled).toBe(true)
    })

    it("given a single-spa-react application, when it is detected, then it is SINGLE_SPA", async () => {
        repositoryWith({ "package.json": manifest({ "single-spa-react": "^6.0.2" }, { react: "^19.3.1", vite: "^8.3.4" }) })

        expect((await new StackDetectionService().detect(target, "main")).compiler).toBe(MicrofrontendCompiler.SINGLE_SPA)
    })

    it("given a micro-lc shell, when it is detected, then the orchestrator dependency makes it MICRO_LC", async () => {
        repositoryWith({ "package.json": manifest({ "@micro-lc/orchestrator": "^2.4.3", react: "^19.3.1" }, { vite: "^8.3.4" }) })

        expect((await new StackDetectionService().detect(target, "main")).compiler).toBe(MicrofrontendCompiler.MICRO_LC)
    })

    /** The parcel template declares no micro-lc package: its UMD build of the parcel entry is the signal */
    it("given a micro-lc parcel, when it is detected, then its UMD library build makes it MICRO_LC", async () => {
        repositoryWith({
            "package.json": manifest({}, { react: "^19.3.1", vite: "^8.3.4" }),
            "vite.config.ts": "build: { lib: { entry: 'src/parcel.tsx', formats: ['umd'], fileName: () => 'parcel.js' } }"
        })

        const detected = await new StackDetectionService().detect(target, "main")

        expect(detected.compiler).toBe(MicrofrontendCompiler.MICRO_LC)
        expect(detected.configPath).toBe("vite.config.ts")
    })

    it("given a UMD library that is no parcel, when it is detected, then it stays VITE", async () => {
        repositoryWith({
            "package.json": manifest({}, { vite: "^8.3.4" }),
            "vite.config.ts": "build: { lib: { entry: 'src/index.ts', formats: ['umd'] } }"
        })

        expect((await new StackDetectionService().detect(target, "main")).compiler).toBe(MicrofrontendCompiler.VITE)
    })

    it("given a Vite app with module federation, when it is detected, then it stays VITE", async () => {
        repositoryWith({
            "package.json": manifest({ react: "^19.3.1" }, { vite: "^8.3.4", "@originjs/vite-plugin-federation": "^1.4.1" }),
            "vite.config.ts": "plugins: [federation({ name: 'shell' })]"
        })

        const detected = await new StackDetectionService().detect(target, "main")

        expect(detected.compiler).toBe(MicrofrontendCompiler.VITE)
        expect(detected.federationConfigured).toBe(true)
    })
})
