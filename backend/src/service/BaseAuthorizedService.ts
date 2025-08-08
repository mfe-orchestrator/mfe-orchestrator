import { ClientSession, ObjectId, Types } from "mongoose"
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError"
import { IUser } from "../models/UserModel"
import UserProject from "../models/UserProjectModel"
import Environment from "../models/EnvironmentModel"
import Deployment from "../models/Deployments"
import UserCannotAccessThisDeploymentError from "../errors/UserCannotAccessThisDeploymentError"

export default abstract class BaseAuthorizedService {
    private user?: IUser

    public constructor(user?: IUser) {
        this.user = user
    }

    /**
     * Ensures the current user has access to the specified environment
     * @param environmentId The ID of the environment to check access for
     * @throws {UserCannotAccessThisEnvironmentError} If user doesn't have access
     */
    protected async ensureAccessToEnvironment(environmentId: string | ObjectId | Types.ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.hasAccessToEnvironment(environmentId, session))) {
            throw new UserCannotAccessThisEnvironmentError(this.getUser())
        }
    }

    /**
     * Ensures the current user has access to the specified project
     * @param projectId The ID of the project to check access for
     * @throws {UserCannotAccessThisProjectError} If user doesn't have access
     */
    protected async ensureAccessToProject(projectId: string | ObjectId | Types.ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.hasAccessToProject(projectId, session))) {
            throw new UserCannotAccessThisProjectError(this.getUser())
        }
    }

    /**
     * Ensures the current user has access to the specified environment
     * @param deploymentId The ID of the environment to check access for
     * @throws {UserCannotAccessThisDeploymentError} If user doesn't have access
     */
    protected async ensureAccessToDeployment(deploymentId: string | ObjectId | Types.ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.hasAccessToDeployment(deploymentId, session))) {
            throw new UserCannotAccessThisDeploymentError(this.getUser())
        }
    }

    /**
     * Checks if the current user has access to the specified environment
     * @param environmentId The ID of the environment to check access for
     * @returns Promise<boolean> True if user has access, false otherwise
     */
    protected async hasAccessToEnvironment(environmentId: string | ObjectId | Types.ObjectId, session?: ClientSession): Promise<boolean> {
        if (!this.user) {
            return false
        }
        const environmentIdObj = typeof environmentId === "string" ? new Types.ObjectId(environmentId) : environmentId

        // Check if environment exists and get its project ID
        const environment = await Environment.findOne({ _id: environmentIdObj }).session(session ?? null)
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
    protected async hasAccessToProject(projectId: string | ObjectId | Types.ObjectId, session?: ClientSession): Promise<boolean> {
        if (!this.user) {
            return false
        }
        const projectIdObj = typeof projectId === "string" ? new Types.ObjectId(projectId) : projectId

        // Check if user is directly associated with the project
        const userProject = await UserProject.findOne({
            userId: this.user._id,
            projectId: projectIdObj
        }).session(session ?? null)

        // If user has any role in the project, they have access
        return Boolean(userProject)
    }

    /**
     * Checks if the current user has access to the specified environment
     * @param deploymentId The ID of the environment to check access for
     * @returns Promise<boolean> True if user has access, false otherwise
     */
    protected async hasAccessToDeployment(deploymentId: string | ObjectId | Types.ObjectId, session?: ClientSession): Promise<boolean> {
        if (!this.user) {
            return false
        }
        const deploymentIdObj = typeof deploymentId === "string" ? new Types.ObjectId(deploymentId) : deploymentId

        // Check if deployment exists and get its project ID
        const deployment = await Deployment.findOne({ _id: deploymentIdObj }).session(session ?? null)
        if (!deployment) {
            return false
        }
        // Check if user has access to the environment that owns this deployment
        return this.hasAccessToEnvironment(deployment.environmentId, session)
    }

    /**
     * Gets the current user
     * @returns The current user or undefined if not set
     */
    protected getUser(): IUser | undefined {
        return this.user
    }
}
