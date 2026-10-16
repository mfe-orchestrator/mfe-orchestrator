import { z } from "zod"
import { IUserOrganization, RoleInOrganization } from "../../models/UserOrganizationModel"
import OrganizationService from "../../service/OrganizationService"
import UserOrganizationService from "../../service/UserOrganizationService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, objectId, READ_ONLY, WRITE } from "../toolDefinition"

const organizationId = objectId("Id of the organization, from organizations_list")
const userId = objectId("Id of the user, from organization_members_list")
const role = z.enum(RoleInOrganization).describe("OWNER and ADMIN administer the organization and reach every project in it; MEMBER reaches only the projects they are invited to")

/** A membership without its invitation token: whoever holds the token can accept the invitation. */
const toMembershipView = (membership: IUserOrganization | undefined) =>
    membership && {
        userId: String(membership.userId),
        organizationId: String(membership.organizationId),
        role: membership.role,
        invitationPending: Boolean(membership.invitationToken),
        invitationExpiresAt: membership.invitationTokenExpiresAt
    }

/**
 * Console-only tools for the organizations of the signed-in user. They act with the user's own
 * principal (`projectScoped: false`), so the services check the user's role in the organization:
 * owners and admins manage it, only owners delete it or hand out ownership.
 */
export const organizationAdminTools = [
    defineTool({
        name: "organization_settings_get",
        title: "Get organization settings",
        description: "Name, slug and description of an organization, your role in it, and how many projects and members (pending invitations included) it has.",
        scope: MCP_SCOPE_READ,
        projectScoped: false,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({ organizationId }),
        run: (args, { principal }) => new OrganizationService(principal).getSummary(args.organizationId)
    }),
    defineTool({
        name: "organization_update",
        title: "Update organization",
        description: "Renames an organization (its slug follows the name) or changes its description. Owners and admins only. Pass description null to remove it.",
        scope: MCP_SCOPE_WRITE,
        projectScoped: false,
        consoleOnly: true,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({
            organizationId,
            name: z.string().trim().min(1).max(255).optional(),
            description: z.string().max(2000).nullable().optional()
        }),
        run: ({ organizationId: id, ...changes }, { principal }) => new OrganizationService(principal).update(id, changes)
    }),
    defineTool({
        name: "organization_create",
        title: "Create organization",
        description: "Creates a new organization owned by you. It starts empty: create projects in it with project_create.",
        scope: MCP_SCOPE_WRITE,
        projectScoped: false,
        consoleOnly: true,
        annotations: WRITE,
        inputSchema: z.object({
            name: z.string().trim().min(1).max(255).describe("Organization name; the slug is derived from it"),
            description: z.string().max(2000).optional()
        }),
        run: (args, { principal }) => new OrganizationService(principal).create(args, principal._id)
    }),
    defineTool({
        name: "organization_delete",
        title: "Delete organization",
        description: "Deletes an organization and its memberships. Only an owner can, and only once it has no projects left: delete them first.",
        scope: MCP_SCOPE_WRITE,
        projectScoped: false,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ organizationId }),
        run: async (args, { principal }) => {
            await new OrganizationService(principal).delete(args.organizationId)
            return { deleted: true, organizationId: args.organizationId }
        }
    }),
    defineTool({
        name: "organization_members_list",
        title: "List organization members",
        description:
            "The members of an organization with their role, whether their invitation is pending and how many of its projects they reach. The `_id` of each is the userId the other member tools take.",
        scope: MCP_SCOPE_READ,
        projectScoped: false,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({ organizationId }),
        run: (args, { principal }) => new UserOrganizationService(principal).getOrganizationUsers(args.organizationId)
    }),
    defineTool({
        name: "organization_member_invite",
        title: "Invite to organization",
        description: "Invites someone to an organization by email with a role. Owners and admins only. Inviting someone already invited sends a fresh invitation.",
        scope: MCP_SCOPE_WRITE,
        projectScoped: false,
        consoleOnly: true,
        // Hands out access to the organization: the assistant asks the user first.
        requiresConfirmation: true,
        annotations: WRITE,
        inputSchema: z.object({ organizationId, email: z.email().describe("Email address of the person to invite"), role }),
        run: async (args, { principal }) => toMembershipView(await new UserOrganizationService(principal).addUserToOrganizationByEmail(args.organizationId, args.email, args.role))
    }),
    defineTool({
        name: "organization_member_role_set",
        title: "Change organization role",
        description:
            "Changes the role of a member of an organization. Owners and admins only; only an owner can make someone owner or change an owner's role, and the last owner cannot be demoted. Demoting an admin takes away the projects they reached through the organization.",
        scope: MCP_SCOPE_WRITE,
        projectScoped: false,
        consoleOnly: true,
        // A role change can take access away (or hand out every project): the user confirms it.
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ organizationId, userId, role }),
        run: async (args, { principal }) => toMembershipView(await new UserOrganizationService(principal).updateRole(args.organizationId, args.userId, args.role))
    }),
    defineTool({
        name: "organization_member_remove",
        title: "Remove from organization",
        description: "Removes a member from an organization. Owners and admins only; the last owner cannot be removed.",
        scope: MCP_SCOPE_WRITE,
        projectScoped: false,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ organizationId, userId }),
        run: async (args, { principal }) => {
            await new UserOrganizationService(principal).removeUser(args.organizationId, args.userId)
            return { removed: true, organizationId: args.organizationId, userId: args.userId }
        }
    })
]
