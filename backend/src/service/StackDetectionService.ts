import { Schema } from "mongoose"
import { fastify } from ".."
import Microfrontend, { IMicrofrontend } from "../models/MicrofrontendModel"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource, parseCompiler, parseFramework } from "../types/MicrofrontendStack"
import BaseAuthorizedService from "./BaseAuthorizedService"
import RepositoryFileService, { mapWithConcurrency, REPOSITORY_CONCURRENCY, RepositoryTarget, toErrorMessage } from "./RepositoryFileService"

const PACKAGE_JSON_PATH = "package.json"

/**
 * The extra package a bundler needs to do module federation. Webpack ships
 * ModuleFederationPlugin inside `webpack.container`, so there is nothing to add there.
 */
export const FEDERATION_PLUGIN_BY_COMPILER: Partial<Record<MicrofrontendCompiler, string>> = {
    [MicrofrontendCompiler.VITE]: "@originjs/vite-plugin-federation"
}

/** The client package a host imports remoteUrl() from */
export const CLIENT_PACKAGE = "@mfe-orchestrator-hub/client"

/**
 * Config files probed in order, so a repository carrying both a vite and a webpack config is
 * reported as the one its dependencies point at rather than as whichever file was looked at first.
 */
const CONFIG_CANDIDATES: { path: string; compiler: MicrofrontendCompiler }[] = [
    { path: "vite.config.ts", compiler: MicrofrontendCompiler.VITE },
    { path: "vite.config.js", compiler: MicrofrontendCompiler.VITE },
    { path: "vite.config.mjs", compiler: MicrofrontendCompiler.VITE },
    { path: "webpack.config.js", compiler: MicrofrontendCompiler.WEBPACK },
    { path: "webpack.config.ts", compiler: MicrofrontendCompiler.WEBPACK },
    { path: "webpack.config.mjs", compiler: MicrofrontendCompiler.WEBPACK }
]

/** Most specific first: an Angular app also declares rxjs, a Vue one never declares react */
const FRAMEWORK_MARKERS: { dependency: string; framework: MicrofrontendFramework }[] = [
    { dependency: "@angular/core", framework: MicrofrontendFramework.ANGULAR },
    { dependency: "vue", framework: MicrofrontendFramework.VUE },
    { dependency: "react", framework: MicrofrontendFramework.REACT }
]

const COMPILER_MARKERS: { dependency: string; compiler: MicrofrontendCompiler }[] = [
    { dependency: "@originjs/vite-plugin-federation", compiler: MicrofrontendCompiler.VITE },
    { dependency: "vite", compiler: MicrofrontendCompiler.VITE },
    { dependency: "webpack", compiler: MicrofrontendCompiler.WEBPACK }
]

export interface DetectedStack {
    framework?: MicrofrontendFramework
    compiler?: MicrofrontendCompiler
    /** Path of the bundler config found in the repository, when there is one */
    configPath?: string
    /** Whether the bundler config already mentions module federation */
    federationConfigured: boolean
    /** Whether the federation plugin the bundler needs is declared in package.json, or none is */
    federationPluginInstalled: boolean
    /** Whether the client package that resolves remote urls is already declared */
    clientPackageInstalled: boolean
}

export interface MicrofrontendStackDetectionDTO extends Partial<DetectedStack> {
    microfrontendId: string
    slug: string
    name: string
    branch?: string
    error?: string
}

interface PackageManifest {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
}

/**
 * Works out the framework and bundler of a microfrontend by reading its repository.
 *
 * Web components are deliberately never inferred: a Vite project without the federation plugin
 * looks exactly like one that has simply not been integrated yet, which is the case this whole
 * feature exists to fix. That stack only comes from a template or from the user.
 */
export class StackDetectionService extends BaseAuthorizedService {
    private readonly repositoryFiles = new RepositoryFileService(this.user)

    /**
     * Detects the stack of every microfrontend of the project backed by a repository and stores
     * what it found, leaving alone the ones whose stack came from a template or from the user.
     */
    async detectForProject(projectId: string | Schema.Types.ObjectId): Promise<MicrofrontendStackDetectionDTO[]> {
        const targets = await this.repositoryFiles.resolveTargets(projectId)

        return mapWithConcurrency(targets, REPOSITORY_CONCURRENCY, async target => {
            const base = {
                microfrontendId: target.microfrontend._id.toString(),
                slug: target.microfrontend.slug,
                name: target.microfrontend.name
            }

            if (!target.codeRepository) {
                return { ...base, error: "Code repository connection not found" }
            }

            try {
                const branch = await this.repositoryFiles.getDefaultBranch(target)
                const detected = await this.detect(target, branch)
                await this.persist(target.microfrontend, detected)

                return { ...base, branch, ...detected }
            } catch (error) {
                fastify.log.error(error, `Unable to detect the stack of ${target.microfrontend.slug}`)
                return { ...base, error: toErrorMessage(error) }
            }
        })
    }

    /** Reads package.json and the bundler config of one repository on `branch`. */
    async detect(target: RepositoryTarget, branch: string): Promise<DetectedStack> {
        const manifestFile = await this.repositoryFiles.readFile(target, PACKAGE_JSON_PATH, branch)
        const manifest = manifestFile ? this.parseManifest(manifestFile.raw) : undefined
        const declared = manifest ? this.declaredDependencies(manifest) : new Set<string>()

        const framework = FRAMEWORK_MARKERS.find(marker => declared.has(marker.dependency))?.framework
        const compilerFromManifest = COMPILER_MARKERS.find(marker => declared.has(marker.dependency))?.compiler

        const config = await this.findConfig(target, branch, compilerFromManifest)
        const compiler = compilerFromManifest || config?.compiler

        return {
            framework,
            compiler,
            configPath: config?.path,
            federationConfigured: Boolean(config && this.mentionsFederation(config.raw)),
            federationPluginInstalled: this.isFederationPluginInstalled(compiler, declared),
            clientPackageInstalled: declared.has(CLIENT_PACKAGE)
        }
    }

    /**
     * The bundler config of the repository. When package.json already says which bundler is in
     * use, only that bundler's candidates are read, which also keeps the number of API calls down.
     */
    private async findConfig(target: RepositoryTarget, branch: string, compiler?: MicrofrontendCompiler): Promise<{ path: string; compiler: MicrofrontendCompiler; raw: string } | null> {
        const candidates = compiler ? CONFIG_CANDIDATES.filter(candidate => candidate.compiler === compiler) : CONFIG_CANDIDATES

        for (const candidate of candidates) {
            const file = await this.repositoryFiles.readFile(target, candidate.path, branch)
            if (file) {
                return { path: candidate.path, compiler: candidate.compiler, raw: file.raw }
            }
        }

        return null
    }

    private isFederationPluginInstalled(compiler: MicrofrontendCompiler | undefined, declared: Set<string>): boolean {
        if (!compiler) {
            return false
        }

        const plugin = FEDERATION_PLUGIN_BY_COMPILER[compiler]
        return plugin ? declared.has(plugin) : true
    }

    private mentionsFederation(configContent: string): boolean {
        return configContent.includes("federation(") || configContent.includes("ModuleFederationPlugin")
    }

    private declaredDependencies(manifest: PackageManifest): Set<string> {
        return new Set([manifest.dependencies, manifest.devDependencies, manifest.peerDependencies, manifest.optionalDependencies].flatMap(section => (section ? Object.keys(section) : [])))
    }

    private parseManifest(raw: string): PackageManifest | undefined {
        try {
            return JSON.parse(raw) as PackageManifest
        } catch {
            // A package.json we cannot parse tells us nothing about the stack, and failing the
            // whole detection over it would hide the repositories that are fine
            return undefined
        }
    }

    /**
     * Stores a detected stack, unless the microfrontend already carries one that did not come
     * from detection: a template declared it, or the user picked it by hand.
     */
    private async persist(microfrontend: IMicrofrontend, detected: DetectedStack): Promise<void> {
        if (!detected.framework && !detected.compiler) {
            return
        }

        if (microfrontend.stack && microfrontend.stack.source !== MicrofrontendStackSource.DETECTED) {
            return
        }

        await Microfrontend.updateOne(
            { _id: microfrontend._id },
            {
                $set: {
                    stack: {
                        framework: detected.framework,
                        compiler: detected.compiler,
                        source: MicrofrontendStackSource.DETECTED,
                        detectedAt: new Date()
                    }
                }
            }
        )
    }

    /** Records a stack the user chose, which detection then stops overwriting. */
    async setManualStack(microfrontendId: string, framework?: string, compiler?: string): Promise<IMicrofrontend | null> {
        const microfrontend = await Microfrontend.findById(microfrontendId)

        if (!microfrontend) {
            return null
        }

        await this.ensureAccessToMicrofrontend(microfrontend)

        microfrontend.stack = {
            framework: parseFramework(framework),
            compiler: parseCompiler(compiler),
            source: MicrofrontendStackSource.MANUAL
        }

        return microfrontend.save()
    }
}

export default StackDetectionService
