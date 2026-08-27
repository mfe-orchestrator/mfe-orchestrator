import { ClientSession, ObjectId, Schema } from "mongoose"
import UserCannotAccessThisDeploymentError from "../errors/UserCannotAccessThisDeploymentError"
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisOrganizationError from "../errors/UserCannotAccessThisOrganizationError"
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError"
import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import { IMicrofrontend } from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { ORGANIZATION_ADMIN_ROLES, RoleInOrganization } from "../models/UserOrganizationModel"
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

        // Check if user is directly associated with the project.
        // Rows with a pending invitation token are excluded: until the invitation is
        // accepted the user is not a member and must not reach the project's data.
        const userProject = await UserProject.findOne({
            userId: this.user._id,
            projectId: toObjectId(projectId),
            invitationToken: null
        }).session(session ?? null)

        // If user has any role in the project, they have access
        if (userProject) {
            return true
        }

        // Otherwise the organization decides: whoever administers the organization reaches every
        // project inside it, invited or not. Without this an owner would lose a project as soon as
        // its only member left, with nobody left able to open it.
        const project = await Project.findOne({ _id: toObjectId(projectId) }, { organizationId: 1 }).session(session ?? null)
        if (!project) {
            return false
        }
        return this.isOrganizationAdmin(project.organizationId, session)
    }

    /**
     * The role the current user holds in the organization, or undefined when they hold none.
     *
     * A row still carrying an invitation token is not a membership yet, so it answers undefined:
     * being invited to an organization must not already grant what belonging to it grants.
     */
    protected async getRoleInOrganization(organizationId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<RoleInOrganization | undefined> {
        if (!this.user) {
            return undefined
        }

        const membership = await UserOrganization.findOne({
            userId: toObjectId(this.user._id),
            organizationId: toObjectId(organizationId),
            invitationToken: null
        }).session(session ?? null)

        return membership?.role
    }

    /** True when the user belongs to the organization, whatever the role. */
    protected async hasAccessToOrganization(organizationId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<boolean> {
        return Boolean(await this.getRoleInOrganization(organizationId, session))
    }

    /** True when the user administers the organization, hence reaches all of its projects. */
    protected async isOrganizationAdmin(organizationId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<boolean> {
        const role = await this.getRoleInOrganization(organizationId, session)
        return Boolean(role && ORGANIZATION_ADMIN_ROLES.includes(role))
    }

    /**
     * Ensures the current user belongs to the organization
     * @throws {UserCannotAccessThisOrganizationError} If the user is not a member
     */
    protected async ensureAccessToOrganization(organizationId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.hasAccessToOrganization(organizationId, session))) {
            throw new UserCannotAccessThisOrganizationError(this.getUser())
        }
    }

    /**
     * Ensures the current user administers the organization
     * @throws {UserCannotAccessThisOrganizationError} If the user is not an owner or an admin
     */
    protected async ensureOrganizationAdmin(organizationId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<void> {
        if (!(await this.isOrganizationAdmin(organizationId, session))) {
            throw new UserCannotAccessThisOrganizationError(this.getUser())
        }
    }

    /**
     * The organizations the user administers, as ids.
     *
     * Kept separate from the checks above because the project list needs it the other way round:
     * given a user, which projects are reachable through an organization rather than through an
     * invitation.
     */
    protected async getAdministeredOrganizationIds(session?: ClientSession): Promise<ObjectId[]> {
        if (!this.user) {
            return []
        }

        const memberships = await UserOrganization.find({
            userId: toObjectId(this.user._id),
            role: { $in: ORGANIZATION_ADMIN_ROLES },
            invitationToken: null
        })
            .session(session ?? null)
            .lean()

        return memberships.map(membership => membership.organizationId as unknown as ObjectId)
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
