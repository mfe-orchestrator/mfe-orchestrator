import { ClientSession, ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import UserCannotAccessThisDeploymentError from "../errors/UserCannotAccessThisDeploymentError"
import UserCannotAccessThisEnvironmentError from "../errors/UserCannotAccessThisEnvironmentError"
import UserCannotAccessThisOrganizationError from "../errors/UserCannotAccessThisOrganizationError"
import UserCannotAccessThisProjectError from "../errors/UserCannotAccessThisProjectError"
import CodeRepository, { CodeRepositoryProvider } from "../models/CodeRepositoryModel"
import Deployment from "../models/DeploymentModel"
import Environment from "../models/EnvironmentModel"
import Microfrontend, { ICodeRepositoryMicrofrontend, IMicrofrontend } from "../models/MicrofrontendModel"
import Project from "../models/ProjectModel"
import Service, { IService } from "../models/ServiceModel"
import { IUser } from "../models/UserModel"
import UserOrganization, { ORGANIZATION_ADMIN_ROLES, RoleInOrganization } from "../models/UserOrganizationModel"
import UserProject, { RoleInProject } from "../models/UserProjectModel"
import { toObjectId } from "../utils/mongooseUtils"
import { linksToRepository, RepositoryLinkOwner } from "./repositoryLinks"

/**
 * Who a service acts for.
 *
 * A console session is the user, with everything the user can reach. A MCP access token is bound
 * to the projects chosen at consent: `restrictedToProjectIds` carries that binding, and every
 * check below narrows to it, so a token can never be pointed at another project of the same user.
 */
export type AuthorizedPrincipal = IUser & {
    restrictedToProjectIds?: string[]
    /**
     * Set when an MCP client authenticated with a project API key rather than as a user. There is
     * no person behind it, hence no membership to look up: it reaches its own project and nothing
     * else. `_id` and `email` are synthetic (the key's id, `api-key:<id>`), only ever used in error
     * messages; no service reachable from the MCP tools writes the acting user anywhere.
     */
    apiKeyId?: string
}

/** Code of the refusal of an action outside the functional domains a member is assigned to. */
export const DOMAIN_SCOPE_FORBIDDEN = "DOMAIN_SCOPE_FORBIDDEN"

export const domainScopeForbidden = () => createBusinessException({ code: DOMAIN_SCOPE_FORBIDDEN, message: "This action is outside the domains you are assigned to", statusCode: 403 })

/**
 * Whether something of `domainId` lies inside `scope`. No scope is the whole project; a microfrontend or
 * a service in no domain is outside every scope, since nobody assigned it to the member.
 */
export const isInDomainScope = (scope: string[] | undefined, domainId: unknown): boolean =>
    !scope || (domainId !== undefined && domainId !== null && domainId !== "" && scope.includes(String(domainId)))

/** What a form leaves in a field it does not use: it carries nothing. */
const isBlank = (value: unknown) => value === undefined || value === null || value === ""

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)

/** Whether `fields` carries something only under the keys of `allowed`. */
const carriesOnly = (fields: Record<string, unknown>, allowed: string[]) => Object.entries(fields).every(([key, value]) => isBlank(value) || allowed.includes(key))

/** A name the providers take as a single path segment: never a dot-segment, never a path. */
const isNewRepositoryName = (name: unknown) => typeof name === "string" && /^[A-Za-z0-9._-]+$/.test(name) && name !== "." && name !== ".."

/**
 * Whether every value `given` carries is the one `stored` holds, `stored` already as JSON (an ObjectId as
 * its string). Blank values and `_id` are skipped, the key order does not matter.
 */
const carriesOnlyStored = (given: unknown, stored: unknown): boolean => {
    if (isBlank(given)) return true
    if (Array.isArray(given)) {
        return Array.isArray(stored) && given.length === stored.length && given.every((item, index) => carriesOnlyStored(item, stored[index]))
    }
    if (isPlainObject(given)) {
        return isPlainObject(stored) && Object.entries(given).every(([key, value]) => key === "_id" || carriesOnlyStored(value, stored[key]))
    }
    return JSON.stringify(given) === JSON.stringify(stored)
}

/*
 * Linking a microfrontend or a service to a code repository is an act on the whole project: a repository
 * can be the code of components of other domains, and every field that names it (the id at the provider,
 * the name, the clone URLs, the GitLab path, the provider data, the connection) can point the link
 * elsewhere. So a domain-scoped member never chooses an existing repository: they keep the stored link, or
 * create a new repository with the component. Creating one for a component of theirs that has none
 * (RepositoryCreationService) is not a link to an existing repository either.
 */

/**
 * On create, the only link a domain-scoped member may send is the one to a repository created with the
 * component, as the console and the MCP scaffold send it: the connection, `createData` naming the new
 * repository (a name already taken is refused by the provider), at most the same name and the GitLab group
 * to create it in, and the console's `create_new` marker. A disabled link carries the connection at most:
 * its `createData` creates nothing, so whatever the form left there is not looked at.
 * `scope` is the caller's domain scope, nothing to check without one.
 */
export const ensureOnlyNewRepositoryLinked = (scope: string[] | undefined, given: unknown) => {
    if (!scope || given === undefined) return
    if (!isPlainObject(given)) throw domainScopeForbidden()

    const { enabled, repositoryId, name, gitlab, createData } = given
    // Strictly true: the repository is created, and its name, id and clone URLs come from the provider
    const creates = enabled === true
    const allowed =
        carriesOnly(given, ["enabled", "codeRepositoryId", "repositoryId", "name", "gitlab", "createData"]) &&
        (isBlank(enabled) || typeof enabled === "boolean") &&
        (isBlank(repositoryId) || repositoryId === "create_new") &&
        (isBlank(gitlab) || (isPlainObject(gitlab) && carriesOnly(gitlab, ["groupId", "groupPath"]))) &&
        (!creates ||
            (isPlainObject(createData) &&
                isNewRepositoryName(createData.name) &&
                carriesOnly(createData, ["name", "private", "template", "groupPath"]) &&
                (isBlank(createData.template) || typeof createData.template === "string") &&
                (isBlank(createData.private) || typeof createData.private === "boolean"))) &&
        (isBlank(name) || (creates && isPlainObject(createData) && name === createData.name))
    if (!allowed) throw domainScopeForbidden()
}

/**
 * On update, a domain-scoped member keeps the stored link: a body carrying the link may carry only what is
 * stored (the console form sends it back on every save, without the fields it does not show), anything else
 * is refused. `createData` is skipped, an update creates no repository. Returns whether the link given is to
 * be left out of the update, so that the stored one stays exactly as it is.
 */
export const ensureRepositoryLinkUnchanged = (scope: string[] | undefined, given: unknown, stored: unknown): boolean => {
    if (!scope || given === undefined) return false
    if (!isPlainObject(given)) throw domainScopeForbidden()

    const { createData: _createData, ...link } = given
    // No link stored is a disabled one, as the console sends it back
    if (!carriesOnlyStored(link, JSON.parse(JSON.stringify(stored ?? { enabled: false })))) {
        throw domainScopeForbidden()
    }
    return true
}

/** Something that belongs to a project and, optionally, to one of its functional domains. */
type DomainMember = { projectId: Schema.Types.ObjectId | ObjectId; domainId?: unknown }

export default abstract class BaseAuthorizedService {
    protected user?: AuthorizedPrincipal

    /**
     * The domain scope of the principal per project, resolved once per service instance: a list or a
     * write checks it for every item it touches, and the membership cannot change within one request.
     */
    private readonly domainScopes = new Map<string, Promise<string[] | undefined>>()

    public constructor(user?: AuthorizedPrincipal) {
        this.user = user
    }

    /** True when the principal is confined to some projects and this one is not among them. */
    private isOutsideRestriction(projectId: string | Schema.Types.ObjectId | ObjectId): boolean {
        const restrictedTo = this.user?.restrictedToProjectIds
        return Boolean(restrictedTo) && !restrictedTo!.includes(String(projectId))
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
        if (!this.user || this.isOutsideRestriction(projectId)) {
            return false
        }
        if (this.user.apiKeyId) {
            return Boolean(this.user.restrictedToProjectIds?.length)
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
        // The membership lookup itself, not the guarded one below: a project-bound principal still
        // reaches its own project through the organization it administers.
        const role = await this.findRoleInOrganization(project.organizationId, session)
        return Boolean(role && ORGANIZATION_ADMIN_ROLES.includes(role))
    }

    /**
     * The role the current user holds in the organization, or undefined when they hold none.
     *
     * A row still carrying an invitation token is not a membership yet, so it answers undefined:
     * being invited to an organization must not already grant what belonging to it grants.
     */
    protected async getRoleInOrganization(organizationId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<RoleInOrganization | undefined> {
        // A project-bound principal acts inside its project only: organization level operations
        // (members, invitations, other projects) are out of its reach whatever the user's role.
        if (this.user?.restrictedToProjectIds) {
            return undefined
        }
        return this.findRoleInOrganization(organizationId, session)
    }

    /**
     * The organization role as stored, ignoring the project binding of the principal. Only for checks
     * about a project the principal is bound to, where an organization administrator acts as an owner.
     */
    protected async findRoleInOrganization(organizationId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<RoleInOrganization | undefined> {
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
        if (!this.user || this.user.restrictedToProjectIds) {
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
        return this.ensureAccessToDomainMember(microfrontend)
    }

    protected async ensureAccessToService(service: IService) {
        return this.ensureAccessToDomainMember(service)
    }

    /** The access to the project of a microfrontend or a service, then to its domain for a domain-scoped member. */
    protected async ensureAccessToDomainMember(member: DomainMember) {
        await this.ensureAccessToProject(member.projectId)
        await this.ensureInDomainScope(member.projectId, member.domainId)
    }

    /**
     * The functional domains the principal is confined to in the project, as ids, or undefined when it
     * reaches the whole project. Only a membership marked as scoped confines: an organization
     * administrator reaches every project as an owner, whatever their own membership says, and a project
     * API key has no membership at all. The membership is read even for a principal bound to some
     * projects (an MCP token, the assistant), since the binding narrows the projects, never the domains.
     *
     * Says nothing about the access to the project itself: callers check that first.
     */
    protected getDomainScope(projectId: string | Schema.Types.ObjectId | ObjectId): Promise<string[] | undefined> {
        const key = String(projectId)
        let scope = this.domainScopes.get(key)
        if (!scope) {
            scope = this.resolveDomainScope(key).catch(error => {
                // A failed read is not remembered: the next check of this instance reads the membership again
                this.domainScopes.delete(key)
                throw error
            })
            this.domainScopes.set(key, scope)
        }
        return scope
    }

    private async resolveDomainScope(projectId: string): Promise<string[] | undefined> {
        if (!this.user || this.user.apiKeyId) {
            return undefined
        }
        const membership = await UserProject.findOne({ userId: toObjectId(this.user._id), projectId: toObjectId(projectId), invitationToken: null }, { role: 1, domainScoped: 1, domainIds: 1 })
        // An owner manages the whole project: a scoped owner cannot be saved, and a row that says so anyway does not confine them
        if (!membership?.domainScoped || membership.role === RoleInProject.OWNER) {
            return undefined
        }
        // The stored role, not the guarded one: a project-bound principal of an administrator still acts
        // as one inside the project it is bound to, as hasAccessToProject lets it in.
        const project = await Project.findOne({ _id: toObjectId(projectId) }, { organizationId: 1 })
        const role = project ? await this.findRoleInOrganization(project.organizationId) : undefined
        if (role && ORGANIZATION_ADMIN_ROLES.includes(role)) {
            return undefined
        }
        return (membership.domainIds ?? []).map(String)
    }

    /**
     * Refuses a domain-scoped member something of a domain outside their scope, or of no domain at all.
     * A member reaching the whole project passes whatever the domain.
     */
    protected async ensureInDomainScope(projectId: string | Schema.Types.ObjectId | ObjectId, domainId: unknown): Promise<void> {
        if (!isInDomainScope(await this.getDomainScope(projectId), domainId)) {
            throw domainScopeForbidden()
        }
    }

    /**
     * Refuses a domain-scoped member a write to the repository `link` points to (a commit, a branch, a pull
     * request, a tag) when a microfrontend or a service of another domain, or of none, is linked to the same
     * repository: what they write there becomes the code of components nobody assigned to them. `owner` is
     * the component the write is for; `provider` spares reading the connection when the caller holds it. A
     * member of the whole project passes without a query.
     */
    protected async ensureRepositoryInDomainScope(owner: RepositoryLinkOwner, link: ICodeRepositoryMicrofrontend | undefined, provider?: CodeRepositoryProvider): Promise<void> {
        const scope = await this.getDomainScope(owner.projectId)
        if (!scope || !link?.codeRepositoryId) return
        // The provider decides whether a name or a GitLab path tells the repository
        const links = linksToRepository(owner, provider ?? (await CodeRepository.findById(link.codeRepositoryId, { provider: 1 }))?.provider, link)
        // $nin also matches a document with no domain at all
        const outside = { domainId: { $nin: scope.map(id => toObjectId(id)) } }
        const [microfrontendOutside, serviceOutside] = await Promise.all([
            links.microfrontends ? Microfrontend.exists({ ...links.microfrontends, ...outside }) : null,
            links.services ? Service.exists({ ...links.services, ...outside }) : null
        ])
        if (microfrontendOutside || serviceOutside) {
            throw domainScopeForbidden()
        }
    }

    /**
     * Refuses a domain-scoped member what changes the project as a whole (its environments, domains,
     * settings, members...): those belong to every domain, and so to nobody assigned to only some of them.
     */
    protected async ensureWholeProject(projectId: string | Schema.Types.ObjectId | ObjectId): Promise<void> {
        if (await this.getDomainScope(projectId)) {
            throw domainScopeForbidden()
        }
    }

    /** As {@link ensureWholeProject}, for the project the environment belongs to. */
    protected async ensureWholeProjectOfEnvironment(environmentId: string | Schema.Types.ObjectId | ObjectId, session?: ClientSession): Promise<void> {
        const environment = await Environment.findOne({ _id: toObjectId(environmentId) }, { projectId: 1 }).session(session ?? null)
        if (environment) {
            await this.ensureWholeProject(environment.projectId)
        }
    }

    /**
     * The query condition that keeps what the principal may see of the project: nothing for a member of
     * the whole project, the domains in scope otherwise. `field` is where the domain id is, `_id` when
     * the domains themselves are queried.
     */
    protected async domainScopeFilter(projectId: string | Schema.Types.ObjectId | ObjectId, field = "domainId"): Promise<Record<string, unknown>> {
        const scope = await this.getDomainScope(projectId)
        return scope ? { [field]: { $in: scope.map(id => toObjectId(id)) } } : {}
    }

    /**
     * Refuses a VIEWER of the project what writes at its code provider (a new repository, an AI
     * change): a viewer may look, not write. Organization administrators reach every project and act
     * there as owners. Called after the access to the project is checked, which already refuses a
     * call without a principal; a project API key has no membership, its role is checked where it
     * authenticates (the MCP server refuses write tools to a VIEWER key).
     */
    protected async ensureNotViewer(projectId: string | Schema.Types.ObjectId | ObjectId, forbidden: { code: string; message: string }): Promise<void> {
        const user = this.getUser()
        if (!user || this.user?.apiKeyId) return
        const membership = await UserProject.findOne({ userId: user._id, projectId: toObjectId(projectId), invitationToken: null })
        if (membership?.role !== RoleInProject.VIEWER) return
        const project = await Project.findById(projectId, { organizationId: 1 })
        if (project && (await this.isOrganizationAdmin(project.organizationId))) return
        throw createBusinessException({ ...forbidden, statusCode: 403 })
    }

    /**
     * Gets the current user
     * @returns The current user or undefined if not set
     */
    protected getUser(): IUser | undefined {
        return this.user
    }
}
