import { z } from "zod"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { CanaryDeploymentType, CanaryType, HostedOn, MicrofrontendType } from "../../models/MicrofrontendModel"
import CodeRepositoryService from "../../service/CodeRepositoryService"
import MicrofrontendService from "../../service/MicrofrontendService"
import StackDetectionService from "../../service/StackDetectionService"
import { StorageService } from "../../service/StorageService"
import MicrofrontendDTO from "../../types/MicrofrontendDTO"
import { MicrofrontendCompiler, MicrofrontendFramework } from "../../types/MicrofrontendStack"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, McpToolContext, NO_INPUT, objectId, READ_ONLY, WRITE, WRITE_EXTERNAL } from "../toolDefinition"

const microfrontendId = objectId("Id of the microfrontend")

/**
 * The fields a microfrontend can be created or edited with.
 *
 * Deliberately narrower than the console route: no `projectId` (the token's project is the only
 * one), and no `codeRepository.createData`, which creates a repository at the provider and pushes
 * an API key into it. Linking an existing repository is allowed.
 */
const microfrontendFields = {
    name: z.string().min(1).max(255),
    slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes")
        .max(100),
    description: z.string().max(2000).optional(),
    version: z.string().min(1).max(100),
    type: z.enum(MicrofrontendType).optional(),
    path: z.string().max(500).optional(),
    continuousDeployment: z.boolean().optional(),
    parentIds: z.array(objectId("Id of a host microfrontend of this project")).optional(),
    host: z
        .object({
            type: z.enum(HostedOn),
            url: z.string().url().optional(),
            storageId: objectId("Id of a storage of this project").optional(),
            entryPoint: z.string().max(500).optional()
        })
        .optional(),
    codeRepository: z
        .object({
            enabled: z.boolean(),
            codeRepositoryId: objectId("Id of a code repository connection of this project"),
            repositoryId: z.string().min(1).describe("Id of the repository at the provider"),
            name: z.string().optional(),
            cloneUrlHttps: z.string().optional(),
            cloneUrlSsh: z.string().optional(),
            gitlab: z.object({ groupId: z.number().int().optional(), path: z.string().optional() }).optional()
        })
        .optional(),
    canary: z
        .object({
            enabled: z.boolean(),
            percentage: z.number().min(0).max(100),
            type: z.enum(CanaryType),
            deploymentType: z.enum(CanaryDeploymentType),
            version: z.string().optional(),
            url: z.string().url().optional()
        })
        .optional()
}

const createSchema = z.object(microfrontendFields)
const updateSchema = z.object({ microfrontendId, ...createSchema.partial().shape })

/**
 * References in the input are checked through the services before anything is written: the
 * microfrontend service resolves the code repository by id without an access check, so a foreign
 * repository id would otherwise link this project to another project's credentials.
 */
const ensureReferencesBelongToProject = async (input: Partial<z.infer<typeof createSchema>>, { principal }: McpToolContext) => {
    if (input.codeRepository) {
        await new CodeRepositoryService(principal).findById(input.codeRepository.codeRepositoryId)
    }
    if (input.host?.storageId) {
        await new StorageService(principal).getById(input.host.storageId)
    }
    for (const parentId of input.parentIds ?? []) {
        if (!(await new MicrofrontendService(principal).getById(parentId))) {
            throw new EntityNotFoundError(parentId)
        }
    }
}

const getExisting = async (id: string, context: McpToolContext) => {
    const microfrontend = await new MicrofrontendService(context.principal).getById(id)
    if (!microfrontend) {
        throw new EntityNotFoundError(id)
    }
    return microfrontend
}

export const microfrontendTools = [
    defineTool({
        name: "microfrontends_list",
        title: "List microfrontends",
        description: "Every microfrontend of the project, with its version, hosting, canary and repository settings.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new MicrofrontendService(principal).getByProjectId(projectId)
    }),
    defineTool({
        name: "microfrontend_get",
        title: "Get microfrontend",
        description: "One microfrontend of the project.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ microfrontendId }),
        run: (args, context) => getExisting(args.microfrontendId, context)
    }),
    defineTool({
        name: "microfrontend_versions",
        title: "List microfrontend versions",
        description: "The versions of a microfrontend that have been uploaded and can be deployed.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ microfrontendId }),
        run: (args, { principal }) => new MicrofrontendService(principal).getVersionsById(args.microfrontendId)
    }),
    defineTool({
        name: "microfrontend_create",
        title: "Create microfrontend",
        description:
            "Adds a microfrontend to the project. A code repository can be linked if it already exists at the provider; creating a new repository from a template is only possible from the console.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE,
        inputSchema: createSchema,
        run: async (args, context) => {
            await ensureReferencesBelongToProject(args, context)
            return new MicrofrontendService(context.principal).create(args as unknown as MicrofrontendDTO, context.projectId)
        }
    }),
    defineTool({
        name: "microfrontend_update",
        title: "Update microfrontend",
        description: "Changes the given fields of a microfrontend. Nested objects (host, canary, codeRepository) are replaced as a whole.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: updateSchema,
        run: async ({ microfrontendId: id, ...changes }, context) => {
            await getExisting(id, context)
            await ensureReferencesBelongToProject(changes, context)
            return new MicrofrontendService(context.principal).update(id, changes as unknown as MicrofrontendDTO)
        }
    }),
    defineTool({
        name: "microfrontend_delete",
        title: "Delete microfrontend",
        description: "Removes a microfrontend from the project. Deployments already made keep their snapshot.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ microfrontendId }),
        run: (args, { principal }) => new MicrofrontendService(principal).delete(args.microfrontendId)
    }),
    defineTool({
        name: "microfrontend_relation_set",
        title: "Link remote to host",
        description: "Declares that the host microfrontend loads the remote one (module federation parent/child relation).",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ hostId: objectId("Id of the host microfrontend"), remoteId: objectId("Id of the remote microfrontend") }),
        run: (args, { principal }) => new MicrofrontendService(principal).setRelation(args.hostId, args.remoteId)
    }),
    defineTool({
        name: "microfrontend_relation_delete",
        title: "Unlink remote from host",
        description: "Removes the relation between a host and a remote microfrontend.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ hostId: objectId("Id of the host microfrontend"), remoteId: objectId("Id of the remote microfrontend") }),
        run: (args, { principal }) => new MicrofrontendService(principal).deleteRelation(args.hostId, args.remoteId)
    }),
    defineTool({
        name: "microfrontend_trigger_build",
        title: "Trigger build",
        description: "Tags the given branch of the microfrontend's repository with the version, which starts its CI pipeline.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            microfrontendId,
            version: z.string().min(1).max(100).describe("Version to tag, e.g. 1.4.0"),
            branch: z.string().min(1).optional().describe("Branch to tag, main when omitted")
        }),
        run: async (args, { principal }) => {
            await new MicrofrontendService(principal).build(args.microfrontendId, args.version, args.branch)
            return { triggered: true }
        }
    }),
    defineTool({
        name: "microfrontends_detect_stacks",
        title: "Detect stacks",
        description: "Reads each linked repository to detect framework and bundler, and stores what it finds (manual choices are kept).",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new StackDetectionService(principal).detectForProject(projectId)
    }),
    defineTool({
        name: "microfrontend_set_stack",
        title: "Set stack",
        description: "Sets framework and bundler of a microfrontend by hand. Detection never overwrites a manual choice.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ microfrontendId, framework: z.enum(MicrofrontendFramework).optional(), compiler: z.enum(MicrofrontendCompiler).optional() }),
        run: (args, { principal }) => new StackDetectionService(principal).setManualStack(args.microfrontendId, args.framework, args.compiler)
    })
]
