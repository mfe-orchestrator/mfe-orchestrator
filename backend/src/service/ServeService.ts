import axios from "axios"
import { FastifyReply, FastifyRequest } from "fastify"
import fs from "fs"
import { ObjectId, Schema } from "mongoose"
import path from "path"
import Stream from "stream"
import { fastify } from ".."
import AzureStorageClient from "../client/AzureStorageAccount"
import GoogleStorageClient from "../client/GoogleStorageAccount"
import S3BucketClient from "../client/S3Buckets"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import Environment, { IEnvironment } from "../models/EnvironmentModel"
import GlobalVariable, { IGlobalVariable } from "../models/GlobalVariableModel"
import Microfrontend, { CanaryDeploymentType, CanaryType, HostedOn, IMicrofrontend } from "../models/MicrofrontendModel"
import Project, { IProject } from "../models/ProjectModel"
import { IStorage, StorageType } from "../models/StorageModel"
import { toObjectId } from "../utils/mongooseUtils"
import DeploymentService from "./DeploymentService"

interface GetRemotesRequestDTO {
    microfrontendId: string | ObjectId
    deploymentId?: string | ObjectId
    environmentId?: string | ObjectId
}

export interface GetRemotesResponseDTO {
    filteredMicrofrontends: IMicrofrontend[]
    environment: IEnvironment
    microfrontend: IMicrofrontend
    deployment: IDeployment
}

export interface GetMicrofrontendAdaptedDataDTO extends GetRemotesResponseDTO {
    microfrotnedUrls: MicrofrontendAdaptedToServe[]
}

export interface MicrofrontendAdaptedToServe {
    url: string
    slug: string
    continuousDeployment?: boolean
    version: string
    name: string
    nameToIntegrate: string
}

export interface GetAllDataDTO {
    globalVariables?: IGlobalVariable[]
    microfrontends?: MicrofrontendAdaptedToServe[]
}

export interface StreamWithHeader {
    stream: Stream
    headers: Record<string, string>
}

/**
 * Asks the caller to retry on a URL carrying the resolved version, instead of returning content.
 * See getMicrofrontendByDeployment for why the entrypoint of a canary microfrontend needs it.
 */
export interface RedirectToVersion {
    redirectToVersion: string
    headers: Record<string, string>
}

export type ServeFileResult = StreamWithHeader | RedirectToVersion

export const isRedirectToVersion = (result: ServeFileResult): result is RedirectToVersion => "redirectToVersion" in result

//NOTE: Here we need speed so please do not use any third party service

const HEADERS_NO_CACHE = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "cross-origin-resource-policy": "cross-origin"
}

const HEADERS_CACHE = {
    "Cross-Origin-Resource-Policy": "cross-origin"
}

/** Path segment marking the version inside a microfrontend file URL, ex. `/_v/1.4.0/assets/index.js`. */
export const VERSION_PATH_SEGMENT = "_v"

/** Response header telling the caller which version has actually been served. */
const VERSION_HEADER = "x-mfe-version"

/** Query parameter forcing a specific version, to test a canary without waiting for the draw. */
const FORCE_VERSION_QUERY_PARAM = "mfeVersion"

/**
 * Query parameters carrying the identities a canary decision can be based on.
 *
 * They travel in the URL, not in a cookie: microfrontends are loaded with a cross site `import()`,
 * and module scripts are fetched with a fixed `same-origin` credentials mode, so no cookie of the
 * console domain is ever sent along with them (nor is any Set-Cookie of ours stored). The host page
 * is the only place holding this state, and the only way to hand it over is the URL.
 *
 * The host page sends every identity it holds and never learns which one we use, so the rollout
 * strategy, its percentage and even its existence stay on this side: switching a microfrontend from
 * one strategy to another takes no change at all on the host page.
 */
const SESSION_ID_QUERY_PARAM = "mfeSessionId"
const DEVICE_ID_QUERY_PARAM = "mfeDeviceId"
const USER_ID_QUERY_PARAM = "mfeUserId"

/** Number of buckets an identity is hashed into, one per percentage point. */
const CANARY_BUCKETS = 100

/**
 * Client SDK the generated configs delegate the resolution of a remote to.
 *
 * The bundler config never carries a url of ours: it carries a bare specifier that the host bundler
 * resolves against its own node_modules, so the url is asked for at import time and comes from the
 * manifest, already pinned to the version this browser must get. That is what keeps the canary
 * decision on this side: a config with a static url would freeze one version into the host bundle.
 */
const CLIENT_SDK_PACKAGE = "@mfe-orchestrator/client"

/**
 * FNV-1a: cheap, dependency free and stable across processes, which is what makes the decision
 * sticky without storing anything server side.
 * Bucketing by hash also keeps a rollout monotonic: raising the percentage only adds browsers to
 * the canary, it never moves someone who was already on it back to the stable version.
 */
const hashToBucket = (value: string): number => {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index++) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0) % CANARY_BUCKETS
}

interface CodeIntegrationRequestDTO extends GetRemotesRequestDTO {
    framework: string
}

interface CodeIntegrationResponseDTO {
    code: string
}

export default class ServeService {
    /**
     * @param request Fastify request being served, used to read the version override
     * @param reply Fastify reply being served, used to expose the version actually served
     */
    constructor(
        private readonly request?: FastifyRequest,
        private readonly reply?: FastifyReply
    ) {}

    /**
     * A canary changes which files we serve only when it rolls out a version of ours. One based on an
     * external url never reaches this service: the manifest hands that url straight to the host page,
     * and its version has no deployed folder here to be served from.
     */
    private isVersionCanary(microfrontend: IMicrofrontend): boolean {
        const canary = microfrontend.canary
        return Boolean(canary?.enabled && canary.version && canary.deploymentType === CanaryDeploymentType.BASED_ON_VERSION)
    }

    /**
     * The only versions a caller is ever allowed to ask for: anything else, even coming from one of
     * our own URLs, would let the request walk out of the deployed folders.
     */
    private getServableVersions(microfrontend: IMicrofrontend): string[] {
        const canaryVersion = this.isVersionCanary(microfrontend) ? microfrontend.canary?.version : undefined
        return canaryVersion ? [microfrontend.version, canaryVersion] : [microfrontend.version]
    }

    private getQueryParam(name: string): string | undefined {
        const query = this.request?.query as Record<string, string | undefined> | undefined
        const value = query?.[name]
        return typeof value === "string" && value.length > 0 ? value : undefined
    }

    /**
     * Version explicitly requested through the query string, ignored unless it is one of the versions
     * this deployment can serve.
     */
    private getForcedVersion(microfrontend: IMicrofrontend): string | undefined {
        const forcedVersion = this.getQueryParam(FORCE_VERSION_QUERY_PARAM)
        return forcedVersion && this.getServableVersions(microfrontend).includes(forcedVersion) ? forcedVersion : undefined
    }

    /**
     * The generated remotes resolve themselves through the SDK, and the SDK has to be told which backend,
     * project and environment to ask: without this block the generated config cannot work.
     *
     * It is emitted commented out because it does not belong to the bundler config file but to the entry
     * point of the host app, where it has to run before anything imports a remote.
     *
     * @param entryPoint Where the snippet is meant to be pasted, shown to the reader
     * @param readEnvVariable How the host bundler exposes an environment variable to the bundle
     * @param envNote What the reader has to do for those variables to reach the bundle
     */
    private getBootstrapSnippet(microfrontends: MicrofrontendAdaptedToServe[], entryPoint: string, readEnvVariable: (variable: string) => string, envNote: string): string {
        if (microfrontends.length === 0) {
            return ""
        }

        return `

// ---------------------------------------------------------------------------
// Host bootstrap: paste this at the very top of your entry point (${entryPoint}).
// The remotes above ask the SDK for their url, so configure() has to run before
// anything imports one of them.
// ${envNote}
// ---------------------------------------------------------------------------
/*
import { configure } from '${CLIENT_SDK_PACKAGE}'

configure({
  backendUrl: ${readEnvVariable("MFE_BACKEND_URL")},
  projectId: ${readEnvVariable("MFE_PROJECT_ID")},
  environment: ${readEnvVariable("MFE_ENVIRONMENT")}
})
*/`
    }

    getWebpackConfig(microfrontends: MicrofrontendAdaptedToServe[], microfrontendSlug: string) {
        // `promise <expression>` is how ModuleFederationPlugin declares a remote whose url is only known
        // at runtime: the expression is inlined in the host bundle and awaited before the remote is used
        const remotesString = microfrontends
            .map((mfe, index) => {
                const name = mfe.nameToIntegrate || `mfe${index + 1}`
                return `        '${name}': \`promise import('${CLIENT_SDK_PACKAGE}').then(m => m.remoteUrl('${mfe.slug}'))\``
            })
            .join(",\n")

        const remotesBlock =
            microfrontends.length > 0
                ? `
      remotes: {
${remotesString}
      },`
                : ""

        return `// webpack.config.js
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  // ... other webpack config
  plugins: [
    new ModuleFederationPlugin({
      name: '${microfrontendSlug}',
      filename: 'remoteEntry.js',${remotesBlock}
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^18.2.0',
          eager: true
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^18.2.0',
          eager: true
        },
        'react-router-dom': {
          singleton: true,
          requiredVersion: '^6.15.0',
          eager: true
        }
      },
    }),
  ],
};${this.getBootstrapSnippet(microfrontends, "src/index.js", variable => `process.env.${variable}`, "Expose the three variables to the bundle with webpack.EnvironmentPlugin.")}`
    }

    getViteConfig(microfrontends: MicrofrontendAdaptedToServe[], microfrontendSlug: string): string {
        // `externalType: 'promise'` tells the plugin that `external` is an expression resolving to the url
        // instead of the url itself, so it is evaluated and awaited in the host bundle at import time
        const remotesString = microfrontends
            .map((mfe, index) => {
                const name = mfe.nameToIntegrate || `mfe${index + 1}`
                return `        '${name}': {
          external: \`import('${CLIENT_SDK_PACKAGE}').then(m => m.remoteUrl('${mfe.slug}'))\`,
          externalType: 'promise'
        }`
            })
            .join(",\n")

        const remotesBlock =
            microfrontends.length > 0
                ? `
      remotes: {
${remotesString}
      },`
                : ""

        const viteConfig = `// vite.config.js
import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: '${microfrontendSlug}',
      filename: 'remoteEntry.js',${remotesBlock}
      shared: ['react', 'react-dom', 'react-router-dom']
    })
  ],
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        minifyInternalExports: false
      }
    }
  }
});${this.getBootstrapSnippet(microfrontends, "src/main.js", variable => `import.meta.env.VITE_${variable}`, "Vite only exposes to the bundle the variables prefixed with VITE_.")}`

        return viteConfig
    }

    getConfig(framework: string, microfrontends: MicrofrontendAdaptedToServe[], microfrontendSlug: string): string {
        switch (framework) {
            case "vite":
                return this.getViteConfig(microfrontends, microfrontendSlug)
            case "webpack":
                return this.getWebpackConfig(microfrontends, microfrontendSlug)
            default:
                return ""
        }
    }

    async getRemotes({ microfrontendId, environmentId, deploymentId }: GetRemotesRequestDTO): Promise<GetRemotesResponseDTO> {
        let deployment: IDeployment | null = null
        if (deploymentId) {
            deployment = await new DeploymentService().getById(deploymentId)
        } else if (environmentId) {
            deployment = await new DeploymentService().getLastByEnvironmentIdNoAccessCheck(environmentId)
        }
        if (!deployment) {
            throw new EntityNotFoundError(deploymentId?.toString() || "")
        }
        const microfrontend = deployment.microfrontends?.find(mfe => mfe._id.toString() === microfrontendId?.toString())
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId?.toString())
        }

        const environment = await Environment.findById(deployment.environmentId)
        if (!environment) {
            throw new EntityNotFoundError(deployment.environmentId?.toString())
        }

        const filteredMicrofrontends = deployment.microfrontends?.filter(mfe => mfe.parentIds?.some(parentId => parentId.toString() === microfrontendId?.toString())) || []

        return {
            filteredMicrofrontends,
            environment,
            microfrontend,
            deployment
        }
    }

    async getMicrofrontendAdaptedData({ microfrontendId, environmentId, deploymentId }: GetRemotesRequestDTO): Promise<GetMicrofrontendAdaptedDataDTO> {
        const data = await this.getRemotes({ microfrontendId, environmentId, deploymentId })
        const childs = await Promise.all(data.filteredMicrofrontends.map(child => this.adaptMicrofrontendToServe(child, data.environment.slug, data.deployment._id)))

        return {
            ...data,
            microfrotnedUrls: childs
        }
    }

    async getCodeIntegration({ framework, microfrontendId, deploymentId }: CodeIntegrationRequestDTO): Promise<CodeIntegrationResponseDTO> {
        const allData = await this.getRemotes({ microfrontendId, deploymentId })

        const childs = await Promise.all(allData.filteredMicrofrontends.map(child => this.adaptMicrofrontendToServe(child, allData.environment.slug, allData.deployment._id)))

        return {
            code: this.getConfig(framework, childs, allData.microfrontend.slug)
        }
    }
    /**
     * Get all microfrontends by environment ID
     * @param environmentId The ID of the environment
     * @returns Promise with array of Microfrontend objects
     */
    async getAllByEnvironmentId(environmentId: string | Schema.Types.ObjectId): Promise<GetAllDataDTO> {
        const deployment = await Deployment.findOne({ environmentId: toObjectId(environmentId), active: true })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        const environment = await Environment.findById(environmentId)
        if (!environment) {
            throw new EntityNotFoundError("Environment")
        }

        const microFrontendsAdapted = deployment.microfrontends
            ? await Promise.all(deployment.microfrontends.map(microfrontend => this.adaptMicrofrontendToServe(microfrontend, environment.slug, deployment._id)))
            : undefined

        return {
            globalVariables: deployment.variables,
            microfrontends: microFrontendsAdapted
        }
    }

    /**
     * Find an environment by project ID and slug, ignoring case.
     * Collation strength 2 makes "dev", "Dev" and "DEV" resolve to the same environment,
     * so the URLs used to serve the microfrontends do not have to match the stored casing.
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @returns Promise with Environment object or null if not found
     */
    private findEnvironmentByProjectIdAndSlug(projectId: string | ObjectId | Schema.Types.ObjectId, environmentSlug: string): Promise<IEnvironment | null> {
        return Environment.findOne({ slug: environmentSlug, projectId: toObjectId(projectId) }).collation({ locale: "en", strength: 2 })
    }

    /**
     * Get all microfrontends by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @returns Promise with array of Microfrontend objects
     */
    async getAllByProjectIdAndEnvironmentSlug(projectId: string, environmentSlug: string): Promise<GetAllDataDTO> {
        const environment = await this.findEnvironmentByProjectIdAndSlug(projectId, environmentSlug)
        if (!environment) {
            throw new EntityNotFoundError(environmentSlug)
        }
        return this.getAllByEnvironmentId(environment._id)
    }

    /**
     * Get microfrontend by microfrontend ID
     * @param mfeId The ID of the microfrontend
     * @param referer The referer of the request
     * @returns Promise with Microfrontend object or null if not found
     */
    async getMicrofrontendConfigurationByMicrofrontendId(mfeId: string, referer: string): Promise<MicrofrontendAdaptedToServe> {
        const microfrontend = await Microfrontend.findById(mfeId)
        if (!microfrontend) {
            throw new EntityNotFoundError(mfeId)
        }
        const environment = await this.getEnvironmentFomRefererAndProjectId(referer, microfrontend.projectId)

        if (!environment) {
            throw new EntityNotFoundError("Environment")
        }
        const deployment = await Deployment.findOne({ environmentId: environment._id, active: true }).sort({ createdAt: -1 })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        const deployedMFE = deployment.microfrontends?.find(mfe => mfe._id.toString() === mfeId)
        if (!deployedMFE) {
            throw new EntityNotFoundError(mfeId)
        }
        return await this.adaptMicrofrontendToServe(deployedMFE, environment.slug, deployment._id)
    }

    /**
     * Get microfrontend by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @param mfeSlug The slug of the microfrontend
     * @returns Promise with Microfrontend object or null if not found
     */
    async getMicrofrontendConfigurationByProjectIdEnvironmentSlugAndMfeSlug(projectId: string, environmentSlug: string, mfeSlug: string): Promise<MicrofrontendAdaptedToServe> {
        const environment = await this.findEnvironmentByProjectIdAndSlug(projectId, environmentSlug)
        if (!environment) {
            throw new EntityNotFoundError("Environment")
        }
        const deployment = await Deployment.findOne({ environmentId: environment._id, active: true }).sort({ createdAt: -1 })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        const deployedMFE = deployment.microfrontends?.find(mfe => mfe.slug === mfeSlug)
        if (!deployedMFE) {
            throw new EntityNotFoundError(mfeSlug)
        }
        return await this.adaptMicrofrontendToServe(deployedMFE, environment.slug, deployment._id)
    }

    async getMicrofrontendConfigurationByEnvironmentIdAndMfeSlug(environmentId: string, mfeSlug: string): Promise<MicrofrontendAdaptedToServe> {
        const deployment = await Deployment.findOne({ environmentId: toObjectId(environmentId), active: true })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        const deployedMFE = deployment.microfrontends?.find(mfe => mfe.slug === mfeSlug)
        if (!deployedMFE) {
            throw new EntityNotFoundError(mfeSlug)
        }
        const environment = await Environment.findById(environmentId)
        if (!environment) {
            throw new EntityNotFoundError("Environment")
        }
        return await this.adaptMicrofrontendToServe(deployedMFE, environment.slug, deployment._id)
    }

    /**
     * Get global variables by environment ID
     * @param environmentId The ID of the environment
     * @returns Promise with global variables object
     */
    async getGlobalVariablesByEnvironmentId(environmentId: string): Promise<{ key: string; value: string }[]> {
        const deployment = await Deployment.findOne({ environmentId: toObjectId(environmentId), active: true })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        return deployment.variables?.map(v => ({ key: v.key, value: v.value })) || []
    }

    async getGlobalVariablesByEnvironmentIdFile(environmentId: string): Promise<string> {
        const variables = await this.getGlobalVariablesByEnvironmentId(environmentId)
        const fileData = `window.globalConfig = {
  ${variables.map(v => `"${v.key}": "${v.value}"`).join(",\n  ")}
}`
        return fileData
    }

    /**
     * Get global variables by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @returns Promise with global variables object
     */
    async getGlobalVariablesByProjectIdAndEnvironmentSlug(projectId: string, environmentSlug: string): Promise<IGlobalVariable[]> {
        const environment = await this.findEnvironmentByProjectIdAndSlug(projectId, environmentSlug)
        if (!environment) {
            throw new EntityNotFoundError(environmentSlug)
        }
        const deployment = await Deployment.findOne({ environmentId: environment._id, active: true }).sort({ createdAt: -1 })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        return deployment.variables || []
    }

    /**
     * Get microfrontend by environment slug, project ID, and microfrontend slug
     * @param environmentSlug The slug of the environment
     * @param projectId The ID of the project
     * @param microfrontendSlug The slug of the microfrontend
     * @returns Promise with Microfrontend object or null if not found
     */
    async getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(environmentSlug: string, projectId: string, microfrontendSlug: string, filePath: string, version?: string): Promise<ServeFileResult> {
        const projectIdObj = toObjectId(projectId)
        const environment = await this.findEnvironmentByProjectIdAndSlug(projectIdObj, environmentSlug)
        if (!environment) {
            throw new EntityNotFoundError(environmentSlug)
        }

        const project = await Project.findOne({ _id: projectIdObj })
        if (!project) {
            throw new EntityNotFoundError(projectId)
        }

        const deployment = await Deployment.findOne({ environmentId: environment._id }).sort({ deployedAt: -1 })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        return this.getMicrofrontendByDeployment(project, deployment, microfrontendSlug, filePath, version)
    }

    async getMicrofrontendFilesByProjectIdAndMicrofrontendSlug(projectId: string, microfrontendSlug: string, filePath: string, referer: string, version?: string): Promise<ServeFileResult> {
        const project = await Project.findById(projectId)
        if (!project) {
            throw new EntityNotFoundError(projectId)
        }

        const environment = await this.getEnvironmentFomRefererAndProjectId(referer, projectId)
        if (!environment) {
            throw new EntityNotFoundError("Environment")
        }

        const deployment = await Deployment.findOne({ environmentId: environment._id }).sort({ createdAt: -1 })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        return this.getMicrofrontendByDeployment(project, deployment, microfrontendSlug, filePath, version)
    }

    async getMicrofrontendVersion(deployedMicrofrontend: IMicrofrontend, deploymentId?: string | ObjectId | Schema.Types.ObjectId): Promise<string> {
        const forcedVersion = this.getForcedVersion(deployedMicrofrontend)
        if (forcedVersion) {
            return forcedVersion
        }

        if (!this.isVersionCanary(deployedMicrofrontend)) {
            return deployedMicrofrontend.version
        }

        const isCanary = await this.isCanary(deployedMicrofrontend, deploymentId)
        return isCanary && deployedMicrofrontend.canary?.version ? deployedMicrofrontend.canary.version : deployedMicrofrontend.version
    }

    /**
     * Decide whether this request belongs to the canary bucket, according to how the canary is
     * configured. Every strategy but ON_USER is the same bucketing over a different identity: the host
     * page sends all of them and stays unaware of which one ends up being used.
     */
    private async isCanary(microfrontend: IMicrofrontend, deploymentId?: string | ObjectId | Schema.Types.ObjectId): Promise<boolean> {
        switch (microfrontend.canary?.type) {
            // A session id is dropped when the browser closes, so the version is drawn again from scratch
            case CanaryType.ON_SESSIONS:
                return this.isIdInCanaryBucket(microfrontend, this.getQueryParam(SESSION_ID_QUERY_PARAM))
            // A device id outlives the browser, so the version stays the same on this machine
            case CanaryType.COOKIE_BASED:
                return this.isIdInCanaryBucket(microfrontend, this.getQueryParam(DEVICE_ID_QUERY_PARAM))
            case CanaryType.ON_USER:
                return this.isUserInCanary(microfrontend, deploymentId)
            default:
                return false
        }
    }

    /**
     * Bucket one of the identities the host page sent us. Without it the decision cannot be sticky, so
     * it falls back to a plain draw: consistent within the page load, since the version gets pinned in
     * the URL right after, but drawn again on the next one.
     */
    private isIdInCanaryBucket(microfrontend: IMicrofrontend, id?: string): boolean {
        const percentage = microfrontend.canary?.percentage || 0
        if (!id) {
            return Math.random() * CANARY_BUCKETS < percentage
        }
        return hashToBucket(`${id}:${microfrontend._id.toString()}`) < percentage
    }

    /**
     * An explicit row on the deployment always wins, so a single user can be pinned on the canary or
     * kept out of it. Everyone else is bucketed by userId, which keeps the choice stable for that user
     * on any browser and any device.
     */
    private async isUserInCanary(microfrontend: IMicrofrontend, deploymentId?: string | ObjectId | Schema.Types.ObjectId): Promise<boolean> {
        const userId = this.getQueryParam(USER_ID_QUERY_PARAM)
        if (!userId || !deploymentId) {
            return false
        }
        const explicitDecision = await DeploymentToCanaryUsers.findOne({ microfrontendId: microfrontend._id, userId, deploymentId: toObjectId(deploymentId) })
        if (explicitDecision) {
            return explicitDecision.enabled
        }
        return hashToBucket(`${userId}:${microfrontend._id.toString()}`) < (microfrontend.canary?.percentage || 0)
    }

    /**
     * True when the version must be drawn once and then pinned in the URL: the entrypoint is an ES
     * module whose chunks are imported with relative specifiers, so the browser resolves them against
     * the entrypoint final URL. Drawing again on every chunk would mix two versions in the same page.
     */
    private needsVersionInUrl(microfrontend: IMicrofrontend): boolean {
        return this.isVersionCanary(microfrontend)
    }

    /**
     * Turn a deployed microfrontend into what the host page needs to load it.
     *
     * The canary is resolved right here, so the url handed out already points at the chosen version and
     * the host page has nothing to decide, nothing to store about the rollout and no way to tell one
     * strategy from another.
     */
    private async adaptMicrofrontendToServe(microfrontend: IMicrofrontend, environmentSlug?: string, deploymentId?: string | ObjectId | Schema.Types.ObjectId): Promise<MicrofrontendAdaptedToServe> {
        if (!microfrontend.canary?.enabled) {
            return buildMicrofrontendAdaptedToServe(microfrontend, getMicrofrontendUrlStatic(microfrontend, environmentSlug))
        }

        // A canary rolling out a version of ours does not change the url, only which version it is
        // pinned to. Resolving it through getMicrofrontendVersion keeps this a single draw and honours
        // the version override as well.
        if (this.isVersionCanary(microfrontend)) {
            const servedVersion = await this.getMicrofrontendVersion(microfrontend, deploymentId)
            return buildMicrofrontendAdaptedToServe(microfrontend, getMicrofrontendUrlStatic(microfrontend, environmentSlug, servedVersion), servedVersion)
        }

        // A canary pointing at an external url has no version of ours to pin: the url is the decision
        const isCanary = await this.isCanary(microfrontend, deploymentId)
        return buildMicrofrontendAdaptedToServe(microfrontend, isCanary ? getMicrofrontendUrlCanary(microfrontend) : getMicrofrontendUrlStatic(microfrontend, environmentSlug))
    }

    /**
     * Serve a single file of a microfrontend.
     * @param version Version to serve, taken from the URL. When missing and the microfrontend needs a
     * pinned version, the caller is redirected to the same file under the drawn version.
     */
    async getMicrofrontendByDeployment(project: IProject, deployment: IDeployment, microfrontendSlug: string, filePath: string, version?: string): Promise<ServeFileResult> {
        const microfrontend = deployment.microfrontends?.find(mfe => mfe.slug === microfrontendSlug)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendSlug)
        }

        //Adesso tiro fuori il MFE
        const mfeEntryPoint = microfrontend.host.entryPoint || "index.js"
        const isEntryPoint = filePath.includes(mfeEntryPoint)

        if (!version && isEntryPoint && this.needsVersionInUrl(microfrontend)) {
            return {
                headers: HEADERS_NO_CACHE,
                redirectToVersion: await this.getMicrofrontendVersion(microfrontend, deployment._id)
            }
        }

        const versionToServe = version && this.getServableVersions(microfrontend).includes(version) ? version : await this.getMicrofrontendVersion(microfrontend, deployment._id)
        const headers = { ...(isEntryPoint ? HEADERS_NO_CACHE : HEADERS_CACHE), [VERSION_HEADER]: versionToServe }

        switch (microfrontend.host.type) {
            case HostedOn.CUSTOM_SOURCE: {
                const storage = this.getStorage(microfrontend, deployment)
                if (!storage) {
                    throw new Error("Storage not found for microfrontend " + microfrontend.slug)
                }
                return {
                    headers,
                    stream: await this.getMicrofrontendStreamStorage(project, microfrontendSlug, versionToServe, filePath, storage)
                }
            }
            case HostedOn.CUSTOM_URL:
                if (!microfrontend.host.url) {
                    throw new Error("Microfrontend url is not defined from microfrontend " + microfrontend.slug)
                }
                return {
                    headers,
                    stream: await this.getMicrofrontendStreamCustomUrl(project, microfrontendSlug, versionToServe, filePath, microfrontend.host.url)
                }
            case HostedOn.MFE_ORCHESTRATOR_HUB:
                return {
                    headers,
                    stream: await this.getMicrofrontendStreamLocal(project, microfrontendSlug, versionToServe, filePath)
                }
        }
    }

    getStorage(microfrontend: IMicrofrontend, deployment: IDeployment): IStorage | undefined {
        if (!microfrontend.host) return undefined
        if (microfrontend.host.type === HostedOn.CUSTOM_SOURCE && microfrontend.host.storageId) {
            const storageId = microfrontend.host.storageId.toString()
            return deployment.storages?.find(s => storageId === s._id.toString())
        }
        return undefined
    }

    async getMicrofrontendFilesByMicrofrontendId(mfeId: string, filePath: string, referer: string, version?: string): Promise<ServeFileResult> {
        const microfrontend = await Microfrontend.findById(mfeId)
        if (!microfrontend) {
            throw new EntityNotFoundError(mfeId)
        }
        const environment = await this.getEnvironmentFomRefererAndProjectId(referer, microfrontend.projectId)
        if (!environment) {
            throw new EntityNotFoundError("Environment")
        }
        const project = await Project.findById(environment.projectId)
        if (!project) {
            throw new EntityNotFoundError("Project")
        }

        const deployment = await Deployment.findOne({ environmentId: environment._id }).sort({ createdAt: -1 })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        const deployedMFE = deployment.microfrontends?.find(mfe => mfe._id.toString() === mfeId)
        if (!deployedMFE) {
            throw new EntityNotFoundError(mfeId)
        }

        return this.getMicrofrontendByDeployment(project, deployment, deployedMFE.slug, filePath, version)
    }

    getMicrofrontendStreamLocal(project: IProject, microfrontendSlug: string, version: string, filePath: string): Stream {
        const basePath = path.join(fastify.config.MICROFRONTEND_HOST_FOLDER, project.slug + "-" + project._id.toString(), microfrontendSlug, version)
        if (!fs.existsSync(basePath)) {
            throw new Error("Microfrontend file not found in path " + basePath)
        }

        const finalPath = path.join(basePath, filePath)

        if (!fs.existsSync(finalPath)) {
            throw new Error("File not found for path: " + finalPath)
        }

        return fs.createReadStream(finalPath)
    }

    async getMicrofrontendStreamCustomUrl(project: IProject, microfrontendSlug: string, version: string, filePath: string, baseUrl: string): Promise<Stream> {
        let finalPath = path.join(baseUrl, filePath)

        finalPath = finalPath.replace("$version", version)
        finalPath = finalPath.replace("$microfrontendSlug", microfrontendSlug)
        finalPath = finalPath.replace("$projectId", project._id.toString())
        finalPath = finalPath.replace("$projectSlug", project.slug)

        const response = await axios.get(finalPath, { responseType: "stream" })
        return response.data
    }

    async getMicrofrontendStreamStorage(project: IProject, microfrontendSlug: string, version: string, filePath: string, storage: IStorage): Promise<Stream> {
        const storagePath = storage.path || ""
        const basePathInStorage = path.join(storagePath, `${project.slug}-${project._id.toString()}`, microfrontendSlug, version)
        let finalPath = path.join(basePathInStorage, filePath)
        if (finalPath.startsWith("/")) {
            finalPath = finalPath.substring(1)
        }

        switch (storage.type) {
            case StorageType.AZURE: {
                const client = new AzureStorageClient(storage.authConfig)
                return (await client.downloadFileStream(finalPath)) as unknown as Stream
            }
            case StorageType.AWS: {
                const client = new S3BucketClient(storage.authConfig)
                return (await client.downloadFileStream(finalPath)) as unknown as Stream
            }
            case StorageType.GOOGLE: {
                const client = new GoogleStorageClient(storage.authConfig)
                return client.downloadFileStream(finalPath) as unknown as Stream
            }
        }
    }

    getEnvironmentFomRefererAndProjectId(referer: string, projectId: string | Schema.Types.ObjectId) {
        return Environment.findOne({
            projectId: toObjectId(projectId),
            $or: [{ domains: { $regex: new RegExp(referer, "i") } }, { domains: { $regex: new RegExp(new URL(referer).origin, "i") } }]
        })
    }
}

const getBackendUrl = (): string => {
    return process.env.BACKEND_URL || process.env.FRONTEND_URL + "/api"
}

/**
 * @param pinnedVersion When set, the version is written into the path of the url.
 *
 * Pinning it here, instead of leaving the entrypoint redirect to do it, is what keeps the host page
 * independent from its bundler. A classic script (webpack `publicPath: 'auto'`) derives the base of
 * its chunks from `document.currentScript.src`, which is the url *before* any redirect: it would ask
 * for its chunks without the version and could end up mixing two of them. An url that already
 * carries the version has no redirect to follow, so both an ES module and a classic script resolve
 * their chunks on the same version.
 */
const getMicrofrontendUrlStatic = (microfrontend: IMicrofrontend, environmentSlug?: string, pinnedVersion?: string): string => {
    if (!microfrontend.host) {
        throw new Error("Microfrontend host is not defined from microfrontend " + microfrontend.slug)
    }
    if (microfrontend.host.type === HostedOn.MFE_ORCHESTRATOR_HUB || microfrontend.host.type === HostedOn.CUSTOM_SOURCE) {
        const backendUrl = getBackendUrl()
        const versionPath = pinnedVersion ? `${VERSION_PATH_SEGMENT}/${pinnedVersion}/` : ""
        const entryPoint = microfrontend.host.entryPoint || "index.js"
        if (environmentSlug) {
            return `${backendUrl}/serve/mfe/files/auto/${microfrontend.projectId}/${microfrontend.slug}/${versionPath}${entryPoint}`
        } else {
            return `${backendUrl}/serve/mfe/files/${microfrontend._id}/${versionPath}${entryPoint}`
        }
    } else if (microfrontend.host.type === HostedOn.CUSTOM_URL) {
        if (!microfrontend.host.url) {
            throw new Error("Microfrontend URL is not defined")
        }
        return microfrontend.host.url?.replace("$version", microfrontend.version)
    } else {
        throw new Error("Microfrontend host type is not defined")
    }
}

const getMicrofrontendUrlCanary = (microfrontend: IMicrofrontend): string => {
    if (!microfrontend.canary?.url) {
        throw new Error("Microfrontend canary URL is not defined")
    }
    return microfrontend.canary.url
}

/**
 * @param servedVersion Version the url actually resolves to. It is the one reported back, so that a
 * browser landing on a canary is not told it is running the stable version.
 */
const buildMicrofrontendAdaptedToServe = (microfrontend: IMicrofrontend, url: string, servedVersion?: string): MicrofrontendAdaptedToServe => ({
    url,
    version: servedVersion || microfrontend.version,
    name: microfrontend.name,
    slug: microfrontend.slug,
    continuousDeployment: microfrontend.continuousDeployment,
    nameToIntegrate: microfrontend?.slug?.replace(/\//g, "_").replace(/-/g, "") || `mfe${microfrontend._id}`
})
