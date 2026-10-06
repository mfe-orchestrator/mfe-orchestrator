import { z } from "zod"
import { IDeployment } from "../../models/DeploymentModel"
import DeploymentCanaryUsersService from "../../service/DeploymentCanaryUsersService"
import DeploymentService from "../../service/DeploymentService"
import EnvironmentService from "../../service/EnvironmentService"
import { EnvironmentDTO } from "../../types/EnvironmentDTO"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, NO_INPUT, objectId, READ_ONLY, WRITE } from "../toolDefinition"

const environmentId = objectId("Id of the environment")
const deploymentId = objectId("Id of the deployment")

const environmentFields = {
    name: z.string().min(1).max(255),
    slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes")
        .max(100),
    description: z.string().max(2000).optional(),
    color: z.string().min(1).max(50).describe("Colour shown in the console, e.g. #22c55e"),
    isProduction: z.boolean().optional(),
    domains: z.array(z.string().min(1)).optional().describe("Domains the host application of this environment is served on")
}

/**
 * A deployment as the MCP client sees it. The snapshot of the storages is left out: it carries
 * their credentials (encrypted at best), and nothing a client does with a deployment needs them.
 */
const toDeploymentView = (deployment: IDeployment | null) => {
    if (!deployment) return null
    const { storages: _storages, ...view } = deployment.toObject()
    return view
}

export const environmentTools = [
    defineTool({
        name: "environments_list",
        title: "List environments",
        description: "The environments of the project, in display order.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new EnvironmentService(principal).getByProjectId(projectId)
    }),
    defineTool({
        name: "environment_create",
        title: "Create environment",
        description: "Adds an environment to the project, appended after the existing ones.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE,
        inputSchema: z.object(environmentFields),
        run: (args, { principal, projectId }) => new EnvironmentService(principal).create(args as EnvironmentDTO, projectId)
    }),
    defineTool({
        name: "environment_update",
        title: "Update environment",
        description: "Changes the given fields of an environment.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ environmentId, ...z.object(environmentFields).partial().shape }),
        run: ({ environmentId: id, ...changes }, { principal }) => new EnvironmentService(principal).update(id, changes as EnvironmentDTO)
    }),
    defineTool({
        name: "environment_delete",
        title: "Delete environment",
        description: "Deletes an environment together with its deployments, canary enrolments and global variable values.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ environmentId }),
        run: async (args, { principal }) => {
            await new EnvironmentService(principal).deleteSingle(args.environmentId)
            return { deleted: true }
        }
    }),
    defineTool({
        name: "environments_reorder",
        title: "Reorder environments",
        description: "Sets the display order of the environments: pass every environment id of the project, in the new order.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ environmentIds: z.array(environmentId).min(1) }),
        run: (args, { principal, projectId }) => new EnvironmentService(principal).updateOrder(projectId, args.environmentIds)
    }),
    defineTool({
        name: "deployments_list",
        title: "List deployments",
        description: "The deployments of an environment, newest first.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ environmentId }),
        run: async (args, { principal }) => (await new DeploymentService(principal).getByEnvironmentId(args.environmentId)).map(toDeploymentView)
    }),
    defineTool({
        name: "deployment_get_active",
        title: "Get active deployment",
        description: "The deployment an environment is serving right now, or null when it was never deployed.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ environmentId }),
        run: async (args, { principal }) => {
            const deployments = await new DeploymentService(principal).getByEnvironmentId(args.environmentId)
            return toDeploymentView(deployments.find(deployment => deployment.active) ?? deployments[0] ?? null)
        }
    }),
    defineTool({
        name: "deploy",
        title: "Deploy",
        description: "Deploys the current configuration (microfrontends, versions, global variables) to the given environments: what they serve changes immediately.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ environmentIds: z.array(environmentId).min(1) }),
        run: async (args, { principal }) => (await new DeploymentService(principal).createMultiple(args.environmentIds)).map(toDeploymentView)
    }),
    defineTool({
        name: "deployment_rollback",
        title: "Roll back",
        description: "Makes an earlier deployment the active one of its environment again.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ deploymentId }),
        run: async (args, { principal }) => toDeploymentView(await new DeploymentService(principal).redeploy(args.deploymentId))
    }),
    defineTool({
        name: "canary_users_list",
        title: "List canary users",
        description: "The users enrolled in the canary of a deployment.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ deploymentId }),
        run: (args, { principal }) => new DeploymentCanaryUsersService(principal).getCanaryUsersByDeploymentWithPermissionCheck(args.deploymentId)
    }),
    defineTool({
        name: "canary_users_set",
        title: "Set canary users",
        description: "Enrolls users in (or excludes them from) the canary of a deployment. User ids are the ids the host application reports.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ deploymentId, userIds: z.array(z.string().min(1)).min(1), enabled: z.boolean() }),
        run: (args, { principal }) => new DeploymentCanaryUsersService(principal).setCanaryUserMultipleWithPermissionCheck(args.deploymentId, args.userIds, args.enabled)
    }),
    defineTool({
        name: "canary_users_remove",
        title: "Remove canary users",
        description: "Removes users from the canary list of a deployment.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ deploymentId, userIds: z.array(z.string().min(1)).min(1) }),
        run: (args, { principal }) => new DeploymentCanaryUsersService(principal).deleteCanaryUsersWithPermissionCheck(args.deploymentId, args.userIds)
    })
]
