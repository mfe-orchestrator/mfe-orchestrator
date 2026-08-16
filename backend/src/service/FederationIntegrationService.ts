import { Schema } from "mongoose"
import { fastify } from ".."
import { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import Microfrontend, { IMicrofrontend, MicrofrontendType } from "../models/MicrofrontendModel"
import { MicrofrontendCompiler, MicrofrontendFramework, MicrofrontendStackSource, supportsModuleFederation } from "../types/MicrofrontendStack"
import { getBackendUrl } from "../utils/backendUrl"
import { globalVariablesScriptUrl, injectGlobalVariablesScript } from "../utils/globalVariablesScript"
import { toObjectId } from "../utils/mongooseUtils"
import { isDependencyDeclared, PackageManifest, serializePackageJson } from "../utils/packageJsonUtils"
import BaseAuthorizedService from "./BaseAuthorizedService"
import FederationConfigService, { CLIENT_SDK_PACKAGE, FederationRemote, federationName } from "./FederationConfigService"
import RepositoryFileService, { mapWithConcurrency, REPOSITORY_CONCURRENCY, RepositoryTarget, toErrorMessage } from "./RepositoryFileService"
import StackDetectionService, { DetectedStack } from "./StackDetectionService"

const PACKAGE_JSON_PATH = "package.json"

/**
 * Where the document of an application lives, probed in order. Vite keeps it at the root, the
 * webpack configs we generate point HtmlWebpackPlugin at the public one, and the first that is
 * actually there is the one the browser loads.
 */
const HTML_CANDIDATES = new Set(["index.html", "public/index.html", "src/index.html"])

/**
 * The two things this service can write, planned and committed one at a time.
 *
 * They used to travel together and they should not: module federation is baked into the bundle and
 * only concerns a microfrontend consuming others, whereas the runtime configuration script is a tag
 * in the document of a host, read on every page load. Mixing them meant one diff to review, one
 * commit, and no way to take one without the other.
 */
export enum IntegrationScope {
    MODULE_FEDERATION = "MODULE_FEDERATION",
    GLOBAL_VARIABLES = "GLOBAL_VARIABLES"
}

/** Says what the commit is about, so neither integration is described as the other one. */
const COMMIT_MESSAGES: Record<IntegrationScope, string> = {
    [IntegrationScope.MODULE_FEDERATION]: "chore(mfe): wire up module federation",
    [IntegrationScope.GLOBAL_VARIABLES]: "chore(mfe): read runtime configuration from the console"
}

export enum FederationIntegrationStatus {
    /** The repository already carries exactly what we would write */
    ALREADY_INTEGRATED = "ALREADY_INTEGRATED",
    /** No bundler config in the repository: we can write it outright */
    CONFIG_TO_CREATE = "CONFIG_TO_CREATE",
    /** A config is already there and differs: the diff needs a look before we touch it */
    CONFIG_TO_REPLACE = "CONFIG_TO_REPLACE",
    /** Nothing consumes anything: no remotes to inject */
    NO_REMOTES = "NO_REMOTES",
    /** We do not know the framework or the bundler, so we cannot generate anything */
    STACK_UNKNOWN = "STACK_UNKNOWN",
    /** Web components integrate at runtime, there is no config to write */
    RUNTIME_INTEGRATION = "RUNTIME_INTEGRATION",
    /** Global variables only: no document of its own to carry the script tag */
    NO_DOCUMENT = "NO_DOCUMENT",
    ERROR = "ERROR"
}

export interface FederationFileChangeDTO {
    path: string
    /** Absent when the file is not in the repository yet */
    currentContent?: string
    proposedContent: string
}

export interface MicrofrontendIntegrationPlanDTO {
    microfrontendId: string
    slug: string
    name: string
    provider?: CodeRepositoryProvider
    repositoryName: string
    /** Branch the integration would commit on, the repository default */
    branch?: string
    stack: {
        framework?: MicrofrontendFramework
        compiler?: MicrofrontendCompiler
        source?: MicrofrontendStackSource
    }
    status: FederationIntegrationStatus
    remotes: FederationRemote[]
    changes: FederationFileChangeDTO[]
    error?: string
}

export interface FederationIntegrationPlanDTO {
    projectId: string
    microfrontends: MicrofrontendIntegrationPlanDTO[]
}

export interface FederationIntegrationApplyRequestDTO {
    /** The microfrontends to write to. Nothing is written without saying which ones. */
    microfrontendIds: string[]
}

export interface MicrofrontendIntegrationResultDTO {
    microfrontendId: string
    slug: string
    name: string
    branch?: string
    applied: boolean
    writtenPaths: string[]
    error?: string
}

export interface FederationIntegrationApplyResultDTO {
    projectId: string
    results: MicrofrontendIntegrationResultDTO[]
}

/**
 * Wires module federation into the repositories of a project: every microfrontend that consumes
 * others gets the config declaring them as remotes, plus the packages that config needs.
 *
 * It works as a plan and then an apply, like the dependency alignment: the plan says, repository by
 * repository, what would change and shows the diff, and the apply only touches the microfrontends
 * it is explicitly given. A config that is already there is never silently overwritten.
 *
 * The config written is the very one the integration screen shows, generated by
 * FederationConfigService, so the instructions and the automation cannot disagree.
 */
export class FederationIntegrationService extends BaseAuthorizedService {
    private readonly repositoryFiles = new RepositoryFileService(this.user)
    private readonly stackDetection = new StackDetectionService(this.user)
    private readonly federationConfig = new FederationConfigService()

    /** What integrating the whole project would change for one scope, without writing anything. */
    async getPlan(projectId: string | Schema.Types.ObjectId, scope: IntegrationScope = IntegrationScope.MODULE_FEDERATION): Promise<FederationIntegrationPlanDTO> {
        if (scope === IntegrationScope.GLOBAL_VARIABLES) {
            const targets = await this.repositoryFiles.resolveTargets(projectId)
            const microfrontends = await mapWithConcurrency(targets, REPOSITORY_CONCURRENCY, target => this.planGlobalVariablesFor(target))

            return { projectId: projectId.toString(), microfrontends }
        }

        const [targets, remotesByParent] = await Promise.all([this.repositoryFiles.resolveTargets(projectId), this.resolveRemotesByParent(projectId)])

        const microfrontends = await mapWithConcurrency(targets, REPOSITORY_CONCURRENCY, target => this.planFor(target, remotesByParent.get(target.microfrontend._id.toString()) || []))

        return { projectId: projectId.toString(), microfrontends }
    }

    /**
     * Commits the planned changes on the default branch of the selected repositories. The plan is
     * recomputed here rather than trusted from the caller, so what lands is what the repository
     * looks like now.
     */
    async apply(
        projectId: string | Schema.Types.ObjectId,
        request: FederationIntegrationApplyRequestDTO,
        scope: IntegrationScope = IntegrationScope.MODULE_FEDERATION
    ): Promise<FederationIntegrationApplyResultDTO> {
        const selected = new Set(request.microfrontendIds || [])
        const plan = await this.getPlan(projectId, scope)
        const targets = await this.repositoryFiles.resolveTargets(projectId)
        const targetById = new Map(targets.map(target => [target.microfrontend._id.toString(), target]))

        const toApply = plan.microfrontends.filter(item => selected.has(item.microfrontendId))

        const results = await mapWithConcurrency(toApply, REPOSITORY_CONCURRENCY, async item => {
            const result: MicrofrontendIntegrationResultDTO = {
                microfrontendId: item.microfrontendId,
                slug: item.slug,
                name: item.name,
                branch: item.branch,
                applied: false,
                writtenPaths: []
            }

            const target = targetById.get(item.microfrontendId)

            if (!target || !item.branch) {
                result.error = "Repository connection is no longer available"
                return result
            }

            if (item.changes.length === 0) {
                result.error = `Nothing to write: ${item.status}`
                return result
            }

            try {
                const message = COMMIT_MESSAGES[scope]

                for (const change of item.changes) {
                    await this.writeChange(target, item.branch, change, message)
                    result.writtenPaths.push(change.path)
                }
                result.applied = result.writtenPaths.length > 0
            } catch (error) {
                fastify.log.error(error, `The ${scope} integration failed for ${item.slug}`)
                result.error = toErrorMessage(error)
            }

            return result
        })

        return { projectId: projectId.toString(), results }
    }

    /**
     * The remotes of every microfrontend of the project, keyed by the id of the one consuming them.
     * Parenthood, not the HOST type, is what decides: a remote consuming another remote needs its
     * own remotes declared just as much.
     */
    private async resolveRemotesByParent(projectId: string | Schema.Types.ObjectId): Promise<Map<string, FederationRemote[]>> {
        const microfrontends = await Microfrontend.find({ projectId: toObjectId(projectId) }).sort({ slug: 1 })
        const remotesByParent = new Map<string, FederationRemote[]>()

        for (const microfrontend of microfrontends) {
            for (const parentId of microfrontend.parentIds || []) {
                const key = parentId.toString()
                const remotes = remotesByParent.get(key) || []
                remotes.push({ name: federationName(microfrontend.slug), slug: microfrontend.slug })
                remotesByParent.set(key, remotes)
            }
        }

        return remotesByParent
    }

    private async planFor(target: RepositoryTarget, remotes: FederationRemote[]): Promise<MicrofrontendIntegrationPlanDTO> {
        const { microfrontend } = target
        const plan: MicrofrontendIntegrationPlanDTO = {
            microfrontendId: microfrontend._id.toString(),
            slug: microfrontend.slug,
            name: microfrontend.name,
            provider: target.codeRepository?.provider,
            repositoryName: target.repositoryName,
            stack: { framework: microfrontend.stack?.framework, compiler: microfrontend.stack?.compiler, source: microfrontend.stack?.source },
            status: FederationIntegrationStatus.NO_REMOTES,
            remotes,
            changes: []
        }

        if (!target.codeRepository) {
            return { ...plan, status: FederationIntegrationStatus.ERROR, error: "Code repository connection not found" }
        }

        try {
            const branch = await this.repositoryFiles.getDefaultBranch(target)
            const detected = await this.stackDetection.detect(target, branch)
            const stack = this.resolveStack(microfrontend, detected)

            if (remotes.length === 0) {
                return { ...plan, branch, stack }
            }

            if (!supportsModuleFederation(stack.compiler)) {
                return {
                    ...plan,
                    branch,
                    stack,
                    status: stack.compiler ? FederationIntegrationStatus.RUNTIME_INTEGRATION : FederationIntegrationStatus.STACK_UNKNOWN
                }
            }

            if (!stack.framework) {
                return { ...plan, branch, stack, status: FederationIntegrationStatus.STACK_UNKNOWN }
            }

            const federationChanges = await this.buildChanges(target, branch, microfrontend, stack, remotes, detected)
            const configChange = federationChanges.find(change => change.path !== PACKAGE_JSON_PATH)

            return {
                ...plan,
                branch,
                stack,
                changes: federationChanges,
                status: this.statusOf(federationChanges, configChange)
            }
        } catch (error) {
            fastify.log.error(error, `Unable to plan the module federation integration of ${microfrontend.slug}`)
            return { ...plan, status: FederationIntegrationStatus.ERROR, error: toErrorMessage(error) }
        }
    }

    private statusOf(changes: FederationFileChangeDTO[], configChange?: FederationFileChangeDTO): FederationIntegrationStatus {
        if (changes.length === 0) {
            return FederationIntegrationStatus.ALREADY_INTEGRATED
        }

        return configChange && configChange.currentContent === undefined ? FederationIntegrationStatus.CONFIG_TO_CREATE : FederationIntegrationStatus.CONFIG_TO_REPLACE
    }

    /**
     * What the repository stores wins over what we read out of it, unless nothing is stored:
     * a stack a template declared or a user picked is deliberate, detection is a fallback.
     */
    private resolveStack(microfrontend: IMicrofrontend, detected: DetectedStack) {
        const stored = microfrontend.stack

        return {
            framework: stored?.framework || detected.framework,
            compiler: stored?.compiler || detected.compiler,
            source: stored?.source
        }
    }

    /**
     * The files to write: the bundler config, and package.json when the config needs a package the
     * app does not declare yet. Files already carrying what we would write are left out, which is
     * what makes running the integration twice a no-op.
     */
    private async buildChanges(
        target: RepositoryTarget,
        branch: string,
        microfrontend: IMicrofrontend,
        stack: { framework?: MicrofrontendFramework; compiler?: MicrofrontendCompiler },
        remotes: FederationRemote[],
        detected: DetectedStack
    ): Promise<FederationFileChangeDTO[]> {
        const instructions = this.federationConfig.getInstructions({
            framework: stack.framework,
            compiler: stack.compiler,
            microfrontendSlug: microfrontend.slug,
            exposeSelf: microfrontend.type === MicrofrontendType.HOST,
            remotes,
            configPath: detected.configPath,
            projectId: microfrontend.projectId.toString(),
            backendUrl: getBackendUrl()
        })

        if (!instructions.config || !instructions.configPath) {
            return []
        }

        const changes: FederationFileChangeDTO[] = []
        const configFile = await this.repositoryFiles.readFile(target, instructions.configPath, branch)

        if (configFile?.raw !== instructions.config) {
            changes.push({
                path: instructions.configPath,
                currentContent: configFile?.raw,
                proposedContent: instructions.config
            })
        }

        const manifestChange = await this.buildManifestChange(target, branch, [...instructions.dependencies, ...this.federationConfig.getRuntimeDependencies()])
        if (manifestChange) {
            changes.push(manifestChange)
        }

        return changes
    }

    /**
     * What writing the runtime configuration script into the document of a microfrontend would
     * change. No stack detection and no remotes: this integration is a `<script>` tag in an html
     * file, and none of what module federation needs to know applies to it.
     *
     * This is the counterpart of the two values the bundler config carries: those are baked into
     * the bundle and need a build to change, whereas the variables this tag brings in are read on
     * every page load and are edited from the console. The url addresses the project rather than
     * an environment on purpose, so the artifact stays the same one across a promotion.
     *
     * Hosts only. The tag assigns `window.globalConfig`, and there is one window per page: the
     * host's document already configures every remote loaded into it. A remote's own document is
     * the one it is served under while it is developed on its own, so writing the tag there would
     * buy nothing for the deployed application and cost a commit on every repository of the
     * project.
     *
     * Only the first document found is considered: a repository shipping several is shipping one
     * entry point and some fixtures, and guessing which is which is not this service's job.
     */
    private async planGlobalVariablesFor(target: RepositoryTarget): Promise<MicrofrontendIntegrationPlanDTO> {
        const { microfrontend } = target
        const plan: MicrofrontendIntegrationPlanDTO = {
            microfrontendId: microfrontend._id.toString(),
            slug: microfrontend.slug,
            name: microfrontend.name,
            provider: target.codeRepository?.provider,
            repositoryName: target.repositoryName,
            stack: { framework: microfrontend.stack?.framework, compiler: microfrontend.stack?.compiler, source: microfrontend.stack?.source },
            status: FederationIntegrationStatus.NO_DOCUMENT,
            remotes: [],
            changes: []
        }

        if (!target.codeRepository) {
            return { ...plan, status: FederationIntegrationStatus.ERROR, error: "Code repository connection not found" }
        }

        if (microfrontend.type !== MicrofrontendType.HOST) {
            return plan
        }

        try {
            const branch = await this.repositoryFiles.getDefaultBranch(target)
            const url = globalVariablesScriptUrl(getBackendUrl(), microfrontend.projectId.toString())

            for (const path of HTML_CANDIDATES) {
                const file = await this.repositoryFiles.readFile(target, path, branch)

                if (!file) {
                    continue
                }

                const proposedContent = injectGlobalVariablesScript(file.raw, url)

                // A document we found but cannot inject into has nowhere the tag would run before
                // the application, which is the same dead end as having no document at all.
                if (!proposedContent) {
                    return { ...plan, branch, status: file.raw.includes(url) ? FederationIntegrationStatus.ALREADY_INTEGRATED : FederationIntegrationStatus.NO_DOCUMENT }
                }

                return {
                    ...plan,
                    branch,
                    changes: [{ path, currentContent: file.raw, proposedContent }],
                    status: FederationIntegrationStatus.CONFIG_TO_REPLACE
                }
            }

            return { ...plan, branch }
        } catch (error) {
            fastify.log.error(error, `Unable to plan the global variables integration of ${microfrontend.slug}`)
            return { ...plan, status: FederationIntegrationStatus.ERROR, error: toErrorMessage(error) }
        }
    }

    /**
     * package.json with the packages the config needs added, or nothing when they are all declared.
     * Versions are left to the registry through "latest": pinning one here would fight whatever the
     * project already resolves.
     */
    private async buildManifestChange(target: RepositoryTarget, branch: string, packages: string[]): Promise<FederationFileChangeDTO | null> {
        const file = await this.repositoryFiles.readFile(target, PACKAGE_JSON_PATH, branch)

        if (!file) {
            // Writing a package.json from scratch would mean guessing the whole project: the
            // config is still worth writing, and the instructions say what to install
            return null
        }

        let manifest: PackageManifest
        try {
            manifest = JSON.parse(file.raw) as PackageManifest
        } catch {
            return null
        }

        const missing = packages.filter(packageName => !isDependencyDeclared(manifest, packageName))
        if (missing.length === 0) {
            return null
        }

        const dependencies = { ...((manifest.dependencies as Record<string, string>) || {}) }
        const devDependencies = { ...((manifest.devDependencies as Record<string, string>) || {}) }

        for (const packageName of missing) {
            // The client SDK is imported by the app itself, the bundler plugin only at build time
            if (packageName === CLIENT_SDK_PACKAGE) {
                dependencies[packageName] = "latest"
            } else {
                devDependencies[packageName] = "latest"
            }
        }

        const updated: PackageManifest = { ...manifest }
        if (Object.keys(dependencies).length > 0) {
            updated.dependencies = dependencies
        }
        if (Object.keys(devDependencies).length > 0) {
            updated.devDependencies = devDependencies
        }

        return {
            path: PACKAGE_JSON_PATH,
            currentContent: file.raw,
            proposedContent: serializePackageJson(file.raw, updated)
        }
    }

    private async writeChange(target: RepositoryTarget, branch: string, change: FederationFileChangeDTO, message: string): Promise<void> {
        // Re-read to pick up the blob sha GitHub locks the update against, and to tell a creation
        // from an update on the providers that do not hand one out
        const existing = await this.repositoryFiles.readFile(target, change.path, branch)

        await this.repositoryFiles.writeFile(target, {
            path: change.path,
            content: change.proposedContent,
            branch,
            message,
            existing
        })
    }
}

export default FederationIntegrationService
