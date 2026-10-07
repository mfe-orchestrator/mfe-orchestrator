import { z } from "zod"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import Organization from "../../models/OrganizationModel"
import Project from "../../models/ProjectModel"
import { toObjectId } from "../../utils/mongooseUtils"
import { MCP_SCOPE_READ } from "../../utils/oauthConfig"
import { defineTool, McpSession, objectId, READ_ONLY } from "../toolDefinition"

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
    })
]
