import { z } from "zod"
import { fastify } from "../.."
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import UserCannotAccessThisOrganizationError from "../../errors/UserCannotAccessThisOrganizationError"
import Organization from "../../models/OrganizationModel"
import Project from "../../models/ProjectModel"
import { RoleInProject } from "../../models/UserProjectModel"
import { addProjectToGrant, projectCreationRefusal } from "../../service/OAuthGrantService"
import ProjectService from "../../service/ProjectService"
import { toObjectId } from "../../utils/mongooseUtils"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { defineTool, McpSession, objectId, READ_ONLY, WRITE } from "../toolDefinition"

/**
 * The map of what this connection can reach: the shared projects and the organizations they sit
 * in. Built from the shared projects only, never from the user's memberships, so an organization
 * with no shared project does not exist here, and nothing about members is ever returned.
 */
const loadSharedProjects = async (session: McpSession) => {
    const roleById = new Map(session.projects.map(project => [project.projectId, project.role]))
    const projects = await Project.find({ _id: { $in: session.projects.map(project => toObjectId(project.projectId)) } }, { name: 1, organizationId: 1 }).sort({ name: 1 })
    const organizations = await Organization.find({ _id: { $in: [...new Set(projects.map(project => project.organizationId.toString()))].map(id => toObjectId(id)) } }, { name: 1 }).sort({ name: 1 })
    const organizationName = new Map(organizations.map(organization => [organization._id.toString(), organization.name]))

    return {
        organizations: organizations.map(organization => ({ id: organization._id.toString(), name: organization.name })),
        projects: projects.map(project => ({
            id: project._id.toString(),
            name: project.name,
            organizationId: project.organizationId.toString(),
            organizationName: organizationName.get(project.organizationId.toString()) ?? "",
            role: roleById.get(project._id.toString()) ?? ""
        }))
    }
}

const CREATION_REFUSALS = {
    reconsent: "This connection was authorized before project creation was part of the consent: reconnect the client and allow changes again to create projects",
    limit: "This connection already created the most projects one connection may create",
    inactive: "This connection is no longer authorized"
} as const

export const organizationTools = [
    defineTool({
        name: "organizations_list",
        title: "List organizations",
        description: "The organizations that contain projects shared with this connection, with how many of their projects are shared.",
        scope: MCP_SCOPE_READ,
        projectScoped: false,
        annotations: READ_ONLY,
        inputSchema: z.object({}),
        run: async (_args, { session }) => {
            const { organizations, projects } = await loadSharedProjects(session)
            return organizations.map(organization => ({ ...organization, sharedProjects: projects.filter(project => project.organizationId === organization.id).length }))
        }
    }),
    defineTool({
        name: "organization_get",
        title: "Get organization",
        description: "One organization and the projects of it shared with this connection. Members are not exposed.",
        scope: MCP_SCOPE_READ,
        projectScoped: false,
        annotations: READ_ONLY,
        inputSchema: z.object({ organizationId: objectId("Id of an organization, from organizations_list") }),
        run: async (args, { session }) => {
            const { organizations, projects } = await loadSharedProjects(session)
            const organization = organizations.find(candidate => candidate.id === args.organizationId)
            if (!organization) {
                throw new EntityNotFoundError(args.organizationId)
            }
            return {
                ...organization,
                projects: projects.filter(project => project.organizationId === organization.id).map(project => ({ id: project.id, name: project.name, role: project.role }))
            }
        }
    }),
    defineTool({
        name: "projects_list",
        title: "List shared projects",
        description: "The projects shared with this connection, with their organization and your role. Pass one of these ids as `projectId` to the other tools when more than one project is shared.",
        scope: MCP_SCOPE_READ,
        projectScoped: false,
        annotations: READ_ONLY,
        inputSchema: z.object({ organizationId: objectId("Only the projects of this organization").optional() }),
        run: async (args, { session }) => {
            const { projects } = await loadSharedProjects(session)
            return args.organizationId ? projects.filter(project => project.organizationId === args.organizationId) : projects
        }
    }),
    defineTool({
        name: "project_create",
        title: "Create project",
        description:
            "Creates a project in one of the organizations returned by organizations_list, provided you administer it (owner or admin). You become its owner and the project is shared with this connection right away: pass its id as `projectId` to set up environments and microfrontends.",
        scope: MCP_SCOPE_WRITE,
        projectScoped: false,
        annotations: WRITE,
        inputSchema: z.object({
            organizationId: objectId("Organization to create the project in, from organizations_list"),
            name: z
                .string()
                .trim()
                .min(3)
                .max(255)
                .regex(/[a-z0-9]/i, "must contain at least one letter or digit")
                .describe("Project name; the slug is derived from it"),
            description: z.string().max(2000).optional()
        }),
        run: async (args, { session, credential }) => {
            // An API key belongs to one project and has no user behind it to own a new one.
            if (credential.kind !== "oauth") {
                throw createBusinessException({
                    code: "MCP_PROJECT_CREATE_NEEDS_USER",
                    message: "Projects can only be created by a connection authorized by a user, not with a project API key",
                    statusCode: 403
                })
            }
            // Only where the connection already reaches: the organizations of the shared projects. An
            // organization the user administers but did not share anything from stays out of sight.
            const { organizations } = await loadSharedProjects(session)
            if (!organizations.some(organization => organization.id === args.organizationId)) {
                throw new EntityNotFoundError(args.organizationId)
            }

            // Checked before creating, so a refused call leaves no project behind
            const refusal = await projectCreationRefusal(credential.grantId)
            if (refusal) {
                throw createBusinessException({ code: "MCP_PROJECT_CREATE_REFUSED", message: CREATION_REFUSALS[refusal], statusCode: 403 })
            }

            // The project restriction is lifted for this one call: it is what keeps a project-bound
            // principal from holding organization roles, and creating a project is exactly a check of
            // the user's own organization role. ProjectService refuses anyone who is not owner or admin.
            const { restrictedToProjectIds: _restricted, ...user } = session.principal
            let project: Awaited<ReturnType<ProjectService["create"]>>
            try {
                project = await new ProjectService(user).create({ organizationId: args.organizationId, name: args.name, description: args.description }, user._id)
            } catch (error) {
                if (error instanceof UserCannotAccessThisOrganizationError) {
                    throw createBusinessException({ code: "MCP_PROJECT_CREATE_NOT_ADMIN", message: "Only an owner or an admin of the organization can create projects in it", statusCode: 403 })
                }
                throw error
            }
            const projectId = project._id.toString()

            const shared = await addProjectToGrant(credential.grantId, projectId)
            fastify.log.info(
                { audit: "mcp_grant_project_created", grantId: credential.grantId, clientId: credential.clientId, organizationId: args.organizationId, projectId, sharedWithConnection: shared },
                "MCP client created a project"
            )
            if (shared) {
                session.projects.push({ projectId, role: RoleInProject.OWNER })
            }

            return { id: projectId, name: project.name, slug: project.slug, organizationId: args.organizationId, role: RoleInProject.OWNER, sharedWithConnection: shared }
        }
    })
]
