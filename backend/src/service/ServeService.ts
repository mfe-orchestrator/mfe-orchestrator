import Microfrontend, { CanaryDeploymentType, CanaryType, HostedOn, IMicrofrontend } from "../models/MicrofrontendModel"
import GlobalVariable, { IGlobalVariable } from "../models/GlobalVariableModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import Deployment, { IDeployment } from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Project, { IProject } from "../models/ProjectModel"
import path from "path"
import fs from "fs"
import { fastify } from ".."
import { Schema, ObjectId } from "mongoose"
import Stream from "stream"

export interface MicrofrontendAdaptedToServe {
    url: string
    slug: string
    continuousDeployment?: boolean
    version: string
    name: string
}

export interface GetAllDataDTO {
    globalVariables?: IGlobalVariable[]
    microfrontends?: MicrofrontendAdaptedToServe[]
}

export interface StreamWithHeader {
    stream: Stream
    headers: Record<string, string>
}
//NOTE: Here we need speed so please do not use any third party service

const HEADERS_NO_CACHE = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'cross-origin-resource-policy': 'cross-origin'
}

const HEADERS_CACHE = {
    'Cross-Origin-Resource-Policy': 'cross-origin'
}

interface CodeIntegrationRequestDTO {
    framework: string,
    microfrontendId: string,
    deploymentId: string
}

interface CodeIntegrationResponseDTO {
    code: string,
}

export default class ServeService {

    getWebpackConfig(microfrontends: MicrofrontendAdaptedToServe[], microfrontendSlug: string) {
        // Generate remotes string with proper formatting
        const remotesString = microfrontends
            .map((mfe, index) => {
                const name = mfe?.slug?.replace(/\//g, "_").replace(/-/g, "") || `mfe${index + 1}`
                const url = mfe.url
                return `        '${name}': '${name}@${url}'`
            })
            .join(",\n")

        const remotesBlock = microfrontends.length > 0 ? `
      remotes: {
${remotesString}
      },` : ''

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
};`
    }

    getViteConfig(microfrontends: MicrofrontendAdaptedToServe[], microfrontendSlug: string): string {
        const remotes = microfrontends?.reduce((acc, mfe, index) => {
            const name = mfe?.slug?.replace(/\//g, "_").replace(/-/g, "") || `mfe${index + 1}`
            acc[name] = mfe.url
            return acc
        }, {} as Record<string, string>) || {}

        // Generate remotes string with proper indentation
        const remotesString = Object.entries(remotes)
            .map(([key, value]) => `        '${key}': '${value}'`)
            .join(",\n")

        const remotesBlock = microfrontends.length > 0 ? `
      remotes: {
${remotesString}
      },` : ''

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
});`

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

    async getCodeIntegration({ framework, microfrontendId, deploymentId }: CodeIntegrationRequestDTO): Promise<CodeIntegrationResponseDTO> {
        const deployment = await Deployment.findById(deploymentId);
        if (!deployment) {
            throw new EntityNotFoundError(deploymentId);
        }
        const microfrontend = deployment.microfrontends?.find(mfe => mfe._id.toString() === microfrontendId);
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendId);
        }

        const environment = await Environment.findById(deployment.environmentId);
        if (!environment) {
            throw new EntityNotFoundError(deployment.environmentId?.toString());
        }

        const filteredMicrofrontends = deployment.microfrontends
            ?.filter(mfe => mfe.parentIds?.some(parentId => parentId.toString() === microfrontendId)) || []

        const childs = await Promise.all(
            filteredMicrofrontends.map(child => adaptMicrofrontendToServe(child, environment.slug))
        )

        return {
            code: this.getConfig(framework, childs, microfrontend.slug)
        }
    }
    /**
     * Get all microfrontends by environment ID
     * @param environmentId The ID of the environment
     * @returns Promise with array of Microfrontend objects
     */
    async getAllByEnvironmentId(environmentId: string | ObjectId): Promise<GetAllDataDTO> {
        const deployment = await Deployment.findOne({ environmentId, active: true });
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        const environment = await Environment.findById(environmentId)
        if (!environment) {
            throw new EntityNotFoundError("Environment")
        }

        const microFrontendsAdapted = deployment.microfrontends ? await Promise.all(deployment.microfrontends.map((microfrontend) => adaptMicrofrontendToServe(microfrontend, environment.slug))) : undefined

        return {
            globalVariables: deployment.variables,
            microfrontends: microFrontendsAdapted
        }
    }

    /**
     * Get all microfrontends by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @returns Promise with array of Microfrontend objects
     */
    async getAllByProjectIdAndEnvironmentSlug(projectId: string, environmentSlug: string): Promise<GetAllDataDTO> {
        const environment = await Environment.findOne({ slug: environmentSlug, projectId })
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
        const environment = await this.getEnvironmentFomRefererAndProjectId(referer, microfrontend.projectId);

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
        return await adaptMicrofrontendToServe(deployedMFE, environment.slug)
    }

    /**
     * Get microfrontend by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @param mfeSlug The slug of the microfrontend
     * @returns Promise with Microfrontend object or null if not found
     */
    async getMicrofrontendConfigurationByProjectIdEnvironmentSlugAndMfeSlug(projectId: string, environmentSlug: string, mfeSlug: string): Promise<MicrofrontendAdaptedToServe> {
        const environment = await Environment.findOne({
            projectId,
            slug: environmentSlug
        })
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
        return await adaptMicrofrontendToServe(deployedMFE, environmentSlug)
    }

    async getMicrofrontendConfigurationByEnvironmentIdAndMfeSlug(environmentId: string, mfeSlug: string): Promise<MicrofrontendAdaptedToServe> {
        const deployment = await Deployment.findOne({ environmentId, active: true });
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
        return await adaptMicrofrontendToServe(deployedMFE, environment.slug)
    }

    /**
     * Get global variables by environment ID
     * @param environmentId The ID of the environment
     * @returns Promise with global variables object
     */
    async getGlobalVariablesByEnvironmentId(environmentId: string): Promise<{ key: string, value: string }[]> {
        const deployment = await Deployment.findOne({ environmentId, active: true });
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
        const environment = await Environment.findOne({ slug: environmentSlug, projectId })
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
    async getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(environmentSlug: string, projectId: string, microfrontendSlug: string, filePath: string): Promise<StreamWithHeader> {
        const environment = await Environment.findOne({ slug: environmentSlug, projectId })
        if (!environment) {
            throw new EntityNotFoundError(environmentSlug)
        }

        const project = await Project.findOne({ _id: projectId })
        if (!project) {
            throw new EntityNotFoundError(projectId)
        }

        const deployment = await Deployment.findOne({ environmentId: environment._id }).sort({ createdAt: -1 })
        if (!deployment) {
            throw new EntityNotFoundError("Active deployment")
        }
        return this.getMicrofrontendByDeployment(project, deployment, microfrontendSlug, filePath);
    }

    async getMicrofrontendFilesByProjectIdAndMicrofrontendSlug(projectId: string, microfrontendSlug: string, filePath: string, referer: string): Promise<StreamWithHeader> {
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
        return this.getMicrofrontendByDeployment(project, deployment, microfrontendSlug, filePath);
    }

    async getMicrofrontendByDeployment(project: IProject, deployment: IDeployment, microfrontendSlug: string, filePath: string): Promise<StreamWithHeader> {
        const microfrontend = deployment.microfrontends?.find(mfe => mfe.slug === microfrontendSlug)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendSlug)
        }
        const version = microfrontend.version

        //Adesso tiro fuori il MFE
        const mfeEntryPoint = microfrontend.host.entryPoint || "index.js"

        return {
            headers: filePath.includes(mfeEntryPoint) ? HEADERS_NO_CACHE : HEADERS_CACHE,
            stream: await this.getMicrofrontendStream(project, microfrontendSlug, version, filePath)
        }
    }

    async getMicrofrontendFilesByMicrofrontendId(mfeId: string, filePath: string, referer: string): Promise<StreamWithHeader> {
        const microfrontend = await Microfrontend.findById(mfeId)
        if (!microfrontend) {
            throw new EntityNotFoundError(mfeId)
        }
        const environment = await this.getEnvironmentFomRefererAndProjectId(referer, microfrontend.projectId);
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

        const microfrontendSlug = deployedMFE.slug
        const version = deployedMFE.version

        const mfeEntryPoint = deployedMFE.host.entryPoint || "index.js"

        return {
            headers: filePath.includes(mfeEntryPoint) ? HEADERS_NO_CACHE : HEADERS_CACHE,
            stream: await this.getMicrofrontendStream(project, microfrontendSlug, version, filePath)
        }
    }

    getMicrofrontendStream(project: IProject, microfrontendSlug: string, version: string, filePath: string): Stream {
        const basePath = path.join(fastify.config.MICROFRONTEND_HOST_FOLDER, project.slug + "-" + project._id.toString(), microfrontendSlug, version)
        if (!fs.existsSync(basePath)) {
            throw new Error("Microfrontend file not found in path " + basePath)
        }

        const finalPath = path.join(basePath, filePath);

        if (!fs.existsSync(finalPath)) {
            throw new Error("File not found for path: " + finalPath)
        }

        return fs.createReadStream(finalPath)
    }

    getEnvironmentFomRefererAndProjectId(referer: string, projectId: string | ObjectId) {
        return Environment.findOne({
            projectId,
            $or: [
                { url: { $regex: new RegExp(referer, 'i') } },
                { url: { $regex: new RegExp(new URL(referer).origin, 'i') } }
            ]
        })
    }
}

const getBackendUrl = (): string => {
    return process.env.BACKEND_URL || process.env.FRONTEND_URL + "/api"
}

const getMicrofrontendUrlStatic = (microfrontend: IMicrofrontend, environmentSlug?: string): string => {
    if (!microfrontend.host) {
        throw new Error("Microfrontend host is not defined from microfrontend " + microfrontend.slug)
    }
    if (microfrontend.host.type === HostedOn.MFE_ORCHESTRATOR_HUB) {
        const backendUrl = getBackendUrl();
        if (environmentSlug) {
            return `${backendUrl}/serve/mfe/files/${microfrontend.projectId}/${environmentSlug}/${microfrontend.slug}/${microfrontend.host.entryPoint || "index.js"}`
        } else {
            return `${backendUrl}/serve/mfe/files/${microfrontend._id}/${microfrontend.host.entryPoint || "index.js"}`
        }

    } else if (microfrontend.host.type === HostedOn.CUSTOM_URL) {
        if (!microfrontend.host.url) {
            throw new Error("Microfrontend URL is not defined")
        }
        return microfrontend.host.url?.replace("$version", microfrontend.version)
    } else if (microfrontend.host.type === HostedOn.CUSTOM_SOURCE) {
        return "This is custom source => will come soon :)"
    } else {
        throw new Error("Microfrontend host type is not defined")
    }
}

// TODO: Implement cookie check
const getCanaryFromCookie = (): boolean => {
    return Math.random() < 0.5
}

const getMicrofrontendUrlCanary = async (microfrontend: IMicrofrontend, environmentSlug?: string): Promise<string> => {
    if (microfrontend.canary?.deploymentType === CanaryDeploymentType.BASED_ON_VERSION) {
        return getMicrofrontendUrlStatic(microfrontend, environmentSlug)
    } else if (microfrontend.canary?.deploymentType === CanaryDeploymentType.BASED_ON_URL) {
        if (!microfrontend.canary?.url) {
            throw new Error("Microfrontend canary URL is not defined")
        }
        return microfrontend.canary.url
    } else {
        throw new Error("Microfrontend canary deployment type is not defined")
    }
}

const getMicrofrontendUrlCanaryOrStatic = async (microfrontend: IMicrofrontend, deployment?: IDeployment, environmentSlug?: string, userId?: string): Promise<string> => {
    if (microfrontend.canary?.type === CanaryType.ON_SESSIONS) {
        const isCanary = Math.random() < microfrontend.canary?.percentage
        if (isCanary) {
            return getMicrofrontendUrlCanary(microfrontend, environmentSlug)
        } else {
            return getMicrofrontendUrlStatic(microfrontend, environmentSlug)
        }
    } else if (microfrontend.canary?.type === CanaryType.ON_USER) {
        //TODO questo va rivisto tutto(!)
        const deploymentToCanaryUsers = await DeploymentToCanaryUsers.findOne({ microfrontendId: microfrontend._id, userId, deploymentId: deployment?._id })
        if (deploymentToCanaryUsers) {
            return getMicrofrontendUrlCanary(microfrontend, environmentSlug)
        } else {
            return getMicrofrontendUrlStatic(microfrontend, environmentSlug)
        }
    } else if (microfrontend.canary?.type === CanaryType.COOKIE_BASED) {
        const isCookieOkCanry = getCanaryFromCookie()
        if (isCookieOkCanry) {
            return getMicrofrontendUrlCanary(microfrontend)
        } else {
            return getMicrofrontendUrlStatic(microfrontend)
        }
    } else {
        throw new Error("Microfrontend canary type is not defined")
    }
}
const getMicrofrontendUrl = async (microfrontend: IMicrofrontend, environmentSlug?: string): Promise<string> => {
    const isCanary = microfrontend.canary?.enabled
    if (isCanary) {
        return getMicrofrontendUrlCanaryOrStatic(microfrontend, undefined, environmentSlug)
    }
    return getMicrofrontendUrlStatic(microfrontend, environmentSlug)
}

async function adaptMicrofrontendToServe(microfrontend: IMicrofrontend, environmentSlug?: string): Promise<MicrofrontendAdaptedToServe> {
    return {
        url: await getMicrofrontendUrl(microfrontend, environmentSlug),
        version: microfrontend.version,
        name: microfrontend.name,
        slug: microfrontend.slug,
        continuousDeployment: microfrontend.continuousDeployment
    }
}
