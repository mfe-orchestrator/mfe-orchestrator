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
import { ObjectId } from "mongoose"
import Stream from "stream"

export interface MicrofrontendAdaptedToServe {
    url: string
    slug: string
    continuousDeployment?: boolean
}

export interface GetAllDataDTO {
    globalVariables?: IGlobalVariable[]
    microfrontends?: MicrofrontendAdaptedToServe[]
}

//NOTE: Here we need speed so please do not use any third party service

export default class ServeService {
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
    async getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(environmentSlug: string, projectId: string, microfrontendSlug: string, filePath: string): Promise<Stream> {
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

    async getMicrofrontendFilesByProjectIdAndMicrofrontendSlug(projectId: string, microfrontendSlug: string, filePath: string, referer: string): Promise<Stream> {
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

    async getMicrofrontendByDeployment(project: IProject, deployment: IDeployment, microfrontendSlug: string, filePath: string): Promise<Stream> {
        const microfrontend = deployment.microfrontends?.find(mfe => mfe.slug === microfrontendSlug)
        if (!microfrontend) {
            throw new EntityNotFoundError(microfrontendSlug)
        }
        const version = microfrontend.version

        //Adesso tiro fuori il MFE
        return this.getMicrofrontendStream(project, microfrontendSlug, version, filePath)
    }

    async getMicrofrontendFilesByMicrofrontendId(mfeId: string, filePath: string, referer: string): Promise<Stream> {
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

        return this.getMicrofrontendStream(project, microfrontendSlug, version, filePath)
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

const getMicrofrontendUrlStatic = (microfrontend: IMicrofrontend, environmentSlug?: string): string => {
    if (!microfrontend.host) {
        throw new Error("Microfrontend host is not defined from microfrontend " + microfrontend.slug)
    }
    if (microfrontend.host.type === HostedOn.MFE_ORCHESTRATOR_HUB) {
        if (environmentSlug) {
            return `${process.env.BACKEND_URL}/serve/mfe/files/${microfrontend.projectId}/${environmentSlug}/${microfrontend.slug}/${microfrontend.host.entryPoint || "index.js"}`
        } else {
            return `${process.env.BACKEND_URL}/serve/mfe/files/${microfrontend._id}/${microfrontend.host.entryPoint || "index.js"}`
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
        slug: microfrontend.slug,
        continuousDeployment: microfrontend.continuousDeployment
    }
}
