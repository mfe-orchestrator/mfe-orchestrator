import { ClientSession, ObjectId, Schema } from "mongoose"
import UserCannotAccessThisDeploymentError from "../errors/UserCannotAccessThisDeploymentError"
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError"
import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import { IMicrofrontend } from "../models/MicrofrontendModel"
import { IUser } from "../models/UserModel"
import UserProject from "../models/UserProjectModel"
import { toObjectId } from "../utils/mongooseUtils"

export default abstract class BaseAuthorizedService {
    protected user?: IUser

    public constructor(user?: IUser) {
        this.user = user
    }

    /**
     * Ensures the current user has access to the specified environment
     * @param environmentId The ID of the environment to check access for
     * @throws {UserCannotAccessThisEnvironmentError} If user doesn't have access
     */
    protected async ensureAccessToEnvironment(environmentId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.hasAccessToEnvironment(environmentId, session))) {
            throw new UserCannotAccessThisEnvironmentError(this.getUser())
        }
    }

    /**
     * Ensures the current user has access to the specified project
     * @param projectId The ID of the project to check access for
     * @throws {UserCannotAccessThisProjectError} If user doesn't have access
     */
    protected async ensureAccessToProject(projectId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.hasAccessToProject(projectId, session))) {
            throw new UserCannotAccessThisProjectError(this.getUser())
        }
    }

    /**
     * Ensures the current user has access to the specified environment
     * @param deploymentId The ID of the environment to check access for
     * @throws {UserCannotAccessThisDeploymentError} If user doesn't have access
     */
    protected async ensureAccessToDeployment(deploymentId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.hasAccessToDeployment(deploymentId, session))) {
            throw new UserCannotAccessThisDeploymentError(this.getUser())
        }
    }

    /**
     * Checks if the current user has access to the specified environment
     * @param environmentId The ID of the environment to check access for
     * @returns Promise<boolean> True if user has access, false otherwise
     */
    protected async hasAccessToEnvironment(environmentId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<boolean> {
        if (!this.user) {
            return false
        }

        // Check if environment exists and get its project ID
        const environment = await Environment.findOne({ _id: toObjectId(environmentId) }).session(session ?? null)
        if (!environment) {
            return false
        }
        // Check if user has access to the project that owns this environment
        return this.hasAccessToProject(environment.projectId, session)
    }

    /**
     * Checks if the current user has access to the specified project
     * @param projectId The ID of the project to check access for
     * @returns Promise<boolean> True if user has access, false otherwise
     */
    protected async hasAccessToProject(projectId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<boolean> {
        if (!this.user) {
            return false
        }

        // Check if user is directly associated with the project
        const userProject = await UserProject.findOne({
            userId: this.user._id,
            projectId: toObjectId(projectId)
        }).session(session ?? null)

        // If user has any role in the project, they have access
        return Boolean(userProject)
    }

    /**
     * Checks if the current user has access to the specified environment
     * @param deploymentId The ID of the environment to check access for
     * @returns Promise<boolean> True if user has access, false otherwise
     */
    protected async hasAccessToDeployment(deploymentId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<boolean> {
        if (!this.user) {
            return false
        }

        // Check if deployment exists and get its project ID
        const deployment = await Deployment.findOne({ _id: toObjectId(deploymentId) }).session(session ?? null)
        if (!deployment) {
            return false
        }
        // Check if user has access to the environment that owns this deployment
        return this.hasAccessToEnvironment(deployment.environmentId, session)
    }

    protected async ensureAccessToMicrofrontend(microfrontend: IMicrofrontend) {
        return this.ensureAccessToProject(microfrontend.projectId)
    }

    /**
     * Gets the current user
     * @returns The current user or undefined if not set
     */
    protected getUser(): IUser | undefined {
        return this.user
    }
}
