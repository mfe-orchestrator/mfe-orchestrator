import Microfrontend, { CanaryDeploymentType, CanaryType, HostedOn, IMicrofrontend } from "../models/MicrofrontendModel"
import GlobalVariable, { IGlobalVariable } from "../models/GlobalVariableModel"
import DeploymentToCanaryUsers from "../models/DeploymentsToCanaryUsersModel"
import { IDeployment } from "../models/DeploymentModel"

export interface MicrofrontendAdaptedToServe {
    url: string
    slug: string
    continuousDeployment?: boolean
}

export interface GetAllDataDTO {
    globalVariables: IGlobalVariable[]
    microfrontends: MicrofrontendAdaptedToServe[]
}

//NOTE: Here we need speed so please do not use any third party service

export default class ServeService {
    /**
     * Get all microfrontends by environment ID
     * @param environmentId The ID of the environment
     * @returns Promise with array of Microfrontend objects
     */
    async getAllByEnvironmentId(environmentId: string): Promise<GetAllDataDTO> {
        const globalVariables = await GlobalVariable.find({ environmentId })
        const microFrontends = await Microfrontend.find({ environmentId })
        const microFrontendsAdapted = await Promise.all(microFrontends.map(adaptMicrofrontendToServe))

        return {
            globalVariables,
            microfrontends: microFrontendsAdapted
        }
    }

    /**
     * Get all microfrontends by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @returns Promise with array of Microfrontend objects
     */
    async getAllByProjectIdAndEnvironmentSlug(projectId: string, environmentSlug: string): Promise<IMicrofrontend[]> {
        // TODO: Implement database query to fetch by project ID and environment slug
        return []
    }

    /**
     * Get microfrontend by environment slug, project ID, and microfrontend slug
     * @param environmentSlug The slug of the environment
     * @param projectId The ID of the project
     * @param microfrontendSlug The slug of the microfrontend
     * @returns Promise with Microfrontend object or null if not found
     */
    async getByEnvironmentSlugAndProjectIdAndMicrofrontendSlug(environmentSlug: string, projectId: string, microfrontendSlug: string): Promise<IMicrofrontend | null> {
        // TODO: Implement database query to fetch by environment slug, project ID, and microfrontend slug
        return null
    }

    /**
     * Get microfrontend by microfrontend ID
     * @param mfeId The ID of the microfrontend
     * @returns Promise with Microfrontend object or null if not found
     */
    async getMicrofrontendByMicrofrontendId(mfeId: string): Promise<IMicrofrontend | null> {
        // TODO: Implement database query to fetch by microfrontend ID
        return null
    }

    /**
     * Get microfrontend by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @returns Promise with Microfrontend object or null if not found
     */
    async getMicrofrontendByProjectIdAndEnvironmentSlug(projectId: string, environmentSlug: string): Promise<IMicrofrontend | null> {
        // TODO: Implement database query to fetch by project ID and environment slug
        return null
    }

    /**
     * Get global variables by environment ID
     * @param environmentId The ID of the environment
     * @returns Promise with global variables object
     */
    async getGlobalVariablesByEnvironmentId(environmentId: string): Promise<Record<string, any>> {
        // TODO: Implement database query to fetch global variables by environment ID
        return {}
    }

    /**
     * Get global variables by project ID and environment slug
     * @param projectId The ID of the project
     * @param environmentSlug The slug of the environment
     * @returns Promise with global variables object
     */
    async getGlobalVariablesByProjectIdAndEnvironmentSlug(projectId: string, environmentSlug: string): Promise<Record<string, any>> {
        // TODO: Implement database query to fetch global variables by project ID and environment slug
        return {}
    }
}

const getMicrofrontendUrlStatic = (microfrontend: IMicrofrontend, version?: string): string => {
    if (!microfrontend.host) {
        throw new Error("Microfrontend host is not defined from microfrontend " + microfrontend.slug)
    }
    if (microfrontend.host.type === HostedOn.MFE_ORCHESTRATOR_HUB) {
        return `${process.env.FRONTEND_URL}/api/mfe/${microfrontend._id}`
    } else if (microfrontend.host.type === HostedOn.CUSTOM_URL) {
        if (!microfrontend.host.url) {
            throw new Error("Microfrontend URL is not defined")
        }
        return microfrontend.host.url?.replace("$version", version || microfrontend.version)
    } else {
        throw new Error("Microfrontend host type is not defined")
    }
}

// TODO: Implement cookie check
const getCanaryFromCookie = (): boolean => {
    return Math.random() < 0.5
}

const getMicrofrontendUrlCanary = async (microfrontend: IMicrofrontend): Promise<string> => {
    if (microfrontend.canary?.deploymentType === CanaryDeploymentType.BASED_ON_VERSION) {
        return getMicrofrontendUrlStatic(microfrontend, microfrontend.canary?.version)
    } else if (microfrontend.canary?.deploymentType === CanaryDeploymentType.BASED_ON_URL) {
        if (!microfrontend.canary?.url) {
            throw new Error("Microfrontend canary URL is not defined")
        }
        return microfrontend.canary.url
    } else {
        throw new Error("Microfrontend canary deployment type is not defined")
    }
}

const getMicrofrontendUrlCanaryOrStatic = async (microfrontend: IMicrofrontend, deployment?: IDeployment, userId?: string): Promise<string> => {
    if (microfrontend.canary?.type === CanaryType.ON_SESSIONS) {
        const isCanary = Math.random() < microfrontend.canary?.percentage
        if (isCanary) {
            return getMicrofrontendUrlCanary(microfrontend)
        } else {
            return getMicrofrontendUrlStatic(microfrontend)
        }
    } else if (microfrontend.canary?.type === CanaryType.ON_USER) {
        //TODO questo va rivisto tutto(!)
        const deploymentToCanaryUsers = await DeploymentToCanaryUsers.findOne({ microfrontendId: microfrontend._id, userId, deploymentId: deployment?._id })
        if (deploymentToCanaryUsers) {
            return getMicrofrontendUrlCanary(microfrontend)
        } else {
            return getMicrofrontendUrlStatic(microfrontend)
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
const getMicrofrontendUrl = async (microfrontend: IMicrofrontend): Promise<string> => {
    const isCanary = microfrontend.canary?.enabled
    if (isCanary) {
        return getMicrofrontendUrlCanaryOrStatic(microfrontend)
    }
    return getMicrofrontendUrlStatic(microfrontend)
}

async function adaptMicrofrontendToServe(microfrontend: IMicrofrontend): Promise<MicrofrontendAdaptedToServe> {
    let url = await getMicrofrontendUrl(microfrontend)
    return {
        url,
        slug: microfrontend.slug,
        continuousDeployment: microfrontend.continuousDeployment
    }
}
