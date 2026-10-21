import { z } from "zod"
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { ApiKeyRole, ApiKeyStatus, IApiKey } from "../../models/ApiKeyModel"
import { IUserProject, RoleInProject } from "../../models/UserProjectModel"
import { ApiKeyService } from "../../service/ApiKeyService"
import OAuthGrantService from "../../service/OAuthGrantService"
import ProjectService from "../../service/ProjectService"
import UserProjectService from "../../service/UserProjectService"
import { getOAuthConfig, MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, NO_INPUT, objectId, READ_ONLY, WRITE, WRITE_EXTERNAL } from "../toolDefinition"

const userId = objectId("Id of the user, from project_members_list")
const domainIds = z.array(objectId("Id of a functional domain of the project, from domains_list")).max(100)
const role = z.enum(RoleInProject).describe("OWNER manages the project and its members, MEMBER changes it, VIEWER only reads")

/**
 * A project membership as the model sees it. The document carries the invitation token, which is
 * what lets whoever holds it accept the invitation and set the account's password: it never leaves.
 */
const toMembershipView = (membership: IUserProject | undefined) =>
    membership && {
        userId: String(membership.userId),
        role: membership.role,
        domainIds: membership.domainScoped ? (membership.domainIds ?? []).map(String) : [],
        domainScoped: Boolean(membership.domainScoped),
        invitationPending: Boolean(membership.invitationToken),
        invitationExpiresAt: membership.inviationTokenExpiresAt
    }

/** The MCP client pages exist only where MCP is switched on, and so do these tools' answers. */
const ensureMcpEnabled = () => {
    if (!getOAuthConfig().enabled) {
        throw createBusinessException({ code: "MCP_DISABLED", message: "MCP is not enabled on this installation: there are no MCP clients to manage" })
    }
}

/**
 * Console-only tools for what sits around the project rather than in it: deleting it, its GitOps
 * repository, its pipeline templates, its members, its API keys and the MCP clients connected to it.
 */
export const projectAdminTools = [
    defineTool({
        name: "project_delete",
        title: "Delete project",
        description:
            "Deletes the project open in the console with everything in it: microfrontends, environments, deployments, storages, code repository connections, API keys and members. It cannot be undone.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: NO_INPUT,
        run: async (_args, { principal, projectId }) => {
            await new ProjectService(principal).delete(projectId)
            return { deleted: true, projectId }
        }
    }),
    defineTool({
        name: "project_gitops_set",
        title: "Set GitOps repository",
        description:
            "Switches GitOps on or off for the project. When on, every deploy commits to a repository, as Kubernetes manifests, the Namespace of each deployed environment and every config map and secret of the project as they are in it; saving a map or an environment commits nothing. Secret values are committed base64 encoded, which is not encryption: anyone who can read the repository can decode them, say so to the user. Pass repositoryId to commit to an existing repository, or newRepositoryName to have a private one created through the connection. Only an owner of the project (or an administrator of its organization) can do it. Switched off, nothing more is committed and the repository is remembered. The current setting is in project_get (gitOps).",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Pushes every config map and secret of the project, values only base64 encoded, to a repository: confirmed by the user
        requiresConfirmation: true,
        annotations: WRITE_EXTERNAL,
        inputSchema: z
            .object({
                enabled: z.boolean(),
                codeRepositoryId: objectId("Id of the code repository connection, from code_repositories_list").optional(),
                repositoryId: z.string().trim().min(1).max(255).optional().describe('The repositoryId of the repository to commit to, from code_repository_importable with target "service"'),
                newRepositoryName: z
                    .string()
                    .trim()
                    .min(1)
                    .max(100)
                    .optional()
                    .describe("In place of repositoryId: the name of a private repository to create through the connection, e.g. <project slug>-gitops")
            })
            .refine(args => !args.enabled || (args.codeRepositoryId && (args.repositoryId || args.newRepositoryName)), {
                message: "Pass codeRepositoryId and repositoryId, or newRepositoryName, to switch GitOps on"
            })
            .refine(args => !(args.repositoryId && args.newRepositoryName), { message: "Pass repositoryId or newRepositoryName, not both" }),
        run: async (args, { principal, projectId }) => {
            const project = await new ProjectService(principal).update(projectId, { gitOps: args })
            return { gitOps: project?.gitOps }
        }
    }),
    defineTool({
        name: "project_pipelines_set",
        title: "Set pipeline templates repository",
        description:
            "Picks the repository the pipelines of every microfrontend and service scaffolded from a template in the project are copied from, in place of the official mfe-orchestrator/template-pipelines. It has the same layout: <type>/<compiler>/<provider>/ (provider github, gitlab or azure_dev_ops), or <type>/<compiler>/<template slug>/<provider>/ for one template, e.g. service/docker/github/workflows/release.yml; %microfrontendSlug%, %serviceSlug% and %domain% are replaced. A template it has no folder for keeps the pipeline it ships with. Pass repositoryId null to go back to the official ones. Only an owner of the project (or an administrator of its organization) can do it. The current setting is in project_get (pipelines).",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Every repository scaffolded afterwards runs the pipelines of that repository: confirmed by the user
        requiresConfirmation: true,
        annotations: WRITE,
        inputSchema: z
            .object({
                codeRepositoryId: objectId("Id of the code repository connection, from code_repositories_list").optional(),
                repositoryId: z
                    .string()
                    .trim()
                    .min(1)
                    .max(255)
                    .nullable()
                    .describe('The repositoryId of the repository, from code_repository_importable with target "service"; null for the official templates'),
                ref: z.string().trim().max(255).optional().describe("Branch or tag to read; the default branch of the repository when left out")
            })
            .refine(args => args.repositoryId === null || args.codeRepositoryId, { message: "Pass codeRepositoryId with repositoryId" }),
        run: async ({ codeRepositoryId, repositoryId, ref }, { principal, projectId }) => {
            const pipelines = repositoryId === null ? null : { codeRepositoryId: codeRepositoryId!, repositoryId, ref }
            const project = await new ProjectService(principal).update(projectId, { pipelines })
            return { pipelines: project?.pipelines?.codeRepository ? project.pipelines : null }
        }
    }),
    defineTool({
        name: "project_members_list",
        title: "List project members",
        description:
            "The members of the project with their role (OWNER, MEMBER, VIEWER), the functional domains they are confined to (domainScoped, with domainIds: not scoped means the whole project; scoped with no ids, every domain of the scope was deleted and they reach none) and whether their invitation is still pending. The `_id` of each is the userId the other member tools take.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new UserProjectService(principal).getProjectUsers(projectId)
    }),
    defineTool({
        name: "project_member_invite",
        title: "Invite to project",
        description:
            "Invites someone to the project by email with a role, to the whole project or only to some of its functional domains. They get an email to accept (when email delivery is configured; otherwise they join at once). Inviting someone already invited sends a fresh invitation, with the role and domains passed now.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Hands out access to the project: the assistant asks the user first.
        requiresConfirmation: true,
        annotations: WRITE,
        inputSchema: z.object({
            email: z.email().describe("Email address of the person to invite"),
            role,
            domainIds: domainIds.optional().describe("The domains they reach, nothing else of the project; left out or empty, the whole project. Not for an OWNER, who manages the whole project")
        }),
        run: async (args, { principal, projectId }) => toMembershipView(await new UserProjectService(principal).addUserToProjectByEmail(projectId, args.email, args.role, args.domainIds))
    }),
    defineTool({
        name: "project_member_resend_invitation",
        title: "Resend project invitation",
        description: "Sends the invitation email again to a member whose invitation is still pending, with a new expiry.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Sends a fresh invitation link that grants access: the assistant asks the user first.
        requiresConfirmation: true,
        annotations: WRITE,
        inputSchema: z.object({ userId }),
        run: async (args, { principal, projectId }) => toMembershipView(await new UserProjectService(principal).resendInvitation(projectId, args.userId))
    }),
    defineTool({
        name: "project_member_role_set",
        title: "Change project role",
        description:
            "Changes the role of a member of the project, or of a pending invitation, and the functional domains they are confined to. Only an owner of the project (or an administrator of its organization) can do it, and the last owner cannot be demoted.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // Lowering a role takes access away, and raising one hands the project over: confirmed by the user.
        annotations: DESTRUCTIVE,
        inputSchema: z.object({
            userId,
            role,
            domainIds: domainIds
                .optional()
                .describe("Replaces the domains they reach, an empty list opening the whole project; left out, they stay. Promoting to OWNER a member confined to domains needs an empty list")
        }),
        run: async (args, { principal, projectId }) => toMembershipView(await new UserProjectService(principal).updateUserRole(projectId, args.userId, args.role, args.domainIds))
    }),
    defineTool({
        name: "project_member_remove",
        title: "Remove from project",
        description:
            "Removes a member from the project, or revokes a pending invitation: they lose access at once. Only an owner of the project (or an administrator of its organization) can do it, and the last owner cannot be removed.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ userId }),
        run: async (args, { principal, projectId }) => {
            await new UserProjectService(principal).removeUserFromProject(projectId, args.userId)
            return { removed: true, userId: args.userId }
        }
    }),
    defineTool({
        name: "api_keys_list",
        title: "List API keys",
        description: "The API keys of the project with their name, role, status and expiry. The keys themselves are never shown again after creation.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: async (_args, { principal, projectId }) => (await new ApiKeyService(principal).getByProjectId(projectId)).map(apiKey => apiKey.toFrontendObject())
    }),
    defineTool({
        name: "api_key_create",
        title: "Create API key",
        description:
            "Creates an API key for the project, used by CI pipelines and MCP clients. The key is shown to the user in the console only: you never see it, so tell the user to copy it from the result card, because it cannot be shown again.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        // A new credential with access to the project: the assistant asks the user first.
        requiresConfirmation: true,
        annotations: WRITE,
        inputSchema: z.object({
            name: z.string().trim().min(1).max(255).describe("A name saying where the key is used, e.g. 'GitHub Actions deploy'"),
            role: z.enum(ApiKeyRole).optional().describe("MANAGER (the default) can change the project, e.g. upload and deploy; VIEWER only reads"),
            expiresAt: z.iso.datetime({ offset: true }).describe("When the key stops working, an ISO 8601 date-time in the future, e.g. 2027-01-31T00:00:00Z")
        }),
        run: async (args, { principal, projectId }) => {
            const expiresAt = new Date(args.expiresAt)
            if (expiresAt.getTime() <= Date.now()) {
                throw createBusinessException({ code: "API_KEY_EXPIRY_IN_PAST", message: "The expiry date of an API key must be in the future" })
            }
            return new ApiKeyService(principal).create(projectId, { name: args.name, role: args.role, expiresAt })
        },
        presentResult: result => {
            const { apiKey: _secret, projectId: _project, ...visible } = result as IApiKey
            return { forModel: { ...visible, apiKey: "shown to the user only" }, forUser: result }
        }
    }),
    defineTool({
        name: "api_key_revoke",
        title: "Revoke API key",
        description: "Revokes an API key of the project: whatever uses it (CI pipelines, MCP clients) stops working at once.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ apiKeyId: objectId("Id of the API key, from api_keys_list") }),
        run: async (args, { principal }) => {
            const apiKey = await new ApiKeyService(principal).setStatus(args.apiKeyId, ApiKeyStatus.INACTIVE)
            return { id: args.apiKeyId, name: apiKey.name, status: apiKey.status }
        }
    }),
    defineTool({
        name: "mcp_clients_list",
        title: "List MCP clients",
        description:
            "The MCP clients (AI tools such as Claude Code or Cursor) connected to the project, with who connected them, their permissions and the projects they reach. A project owner sees every connection, anybody else only their own.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: async (_args, { principal, projectId }) => {
            ensureMcpEnabled()
            return new OAuthGrantService(principal).listForProject(projectId)
        }
    }),
    defineTool({
        name: "mcp_client_revoke",
        title: "Disconnect MCP client",
        description: "Revokes the connection of an MCP client: it loses access to every project it reached and has to be authorized again.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ grantId: objectId("Id of the connection, from mcp_clients_list") }),
        run: async (args, { principal, projectId }) => {
            ensureMcpEnabled()
            const service = new OAuthGrantService(principal)
            // Only a connection this project lists: the card the user confirms is about this project.
            if (!(await service.listForProject(projectId)).some(grant => grant.id === args.grantId)) {
                throw new EntityNotFoundError(args.grantId)
            }
            await service.revoke(args.grantId)
            return { revoked: true, grantId: args.grantId }
        }
    })
]
