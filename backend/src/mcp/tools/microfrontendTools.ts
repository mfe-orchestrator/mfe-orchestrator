import { z } from "zod"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { CanaryDeploymentType, CanaryType, HostedOn, MicrofrontendKind, MicrofrontendType } from "../../models/MicrofrontendModel"
import { CONTEXT_MAX_LENGTH } from "../../models/ProjectModel"
import CodeRepositoryService from "../../service/CodeRepositoryService"
import MicrofrontendService from "../../service/MicrofrontendService"
import ProjectService from "../../service/ProjectService"
import RepositoryRenameService, { isValidRepositoryName } from "../../service/RepositoryRenameService"
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
 * an API key into it: that is `microfrontend_scaffold`'s. Linking an existing repository is allowed.
 */
const microfrontendFields = {
    name: z.string().min(1).max(255),
    slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and dashes")
        .max(100),
    description: z.string().max(2000).optional(),
    context: z.string().max(CONTEXT_MAX_LENGTH).optional().describe("Markdown notes for AI agents about this microfrontend, replaced as a whole"),
    version: z.string().min(1).max(100).optional().describe("Required for a MICROFRONTEND. A FRONTEND may omit it: the first version its CI registers sets it"),
    type: z.enum(MicrofrontendType).optional(),
    kind: z
        .enum(MicrofrontendKind)
        .optional()
        .describe(
            "MICROFRONTEND (default): a static bundle uploaded to and served by the orchestrator. FRONTEND: the main frontend, built into a Docker image its pipeline pushes; nothing loads it, so it never has parentIds"
        ),
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
        .optional()
        .describe("Where the bundle is served from. Omit it to use the project's default storage, or the MFE Orchestrator hub when the project has none"),
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
        .optional(),
    image: z
        .object({ repository: z.string().max(500).optional() })
        .optional()
        .describe("FRONTEND only: image repository without tag, e.g. ghcr.io/acme/shell. Learnt from the first version the CI registers when not set")
}

export const createSchema = z.object(microfrontendFields)
// The slug is the microfrontend's identity in the upload URL its CI calls: fixed after creation, as in the console
const updateSchema = z.object({ microfrontendId, ...createSchema.omit({ slug: true }).partial().shape })

/**
 * References in the input are checked through the services before anything is written: the
 * microfrontend service resolves the code repository by id without an access check, so a foreign
 * repository id would otherwise link this project to another project's credentials.
 */
export const ensureReferencesBelongToProject = async (input: Partial<z.infer<typeof createSchema>>, { principal }: McpToolContext) => {
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
        description: "Every microfrontend of the project, with its kind, version, hosting, canary and repository settings.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new MicrofrontendService(principal).getByProjectId(projectId)
    }),
    defineTool({
        name: "microfrontend_get",
        title: "Get microfrontend",
        description: "One microfrontend of the project, with aiContext: what the team wrote for AI agents about it and the project. Follow it when working on its code.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ microfrontendId }),
        run: async (args, context) => {
            const microfrontend = await getExisting(args.microfrontendId, context)
            const aiContext = await new ProjectService(context.principal).getContext(context.projectId, { microfrontendId: args.microfrontendId })
            return { ...microfrontend.toObject(), aiContext }
        }
    }),
    defineTool({
        name: "microfrontend_versions",
        title: "List microfrontend versions",
        description: "The versions of a microfrontend that have been uploaded and can be deployed; for a FRONTEND, the image versions its CI registered.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ microfrontendId }),
        run: (args, { principal }) => new MicrofrontendService(principal).getVersionsById(args.microfrontendId)
    }),
    defineTool({
        name: "microfrontend_create",
        title: "Create microfrontend",
        description: "Adds a microfrontend to the project. A code repository can be linked if it already exists at the provider; use microfrontend_scaffold to create a new one from a template.",
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
        description: "Declares that the host microfrontend loads the remote one (module federation parent/child relation). A FRONTEND can be the host, never the remote.",
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
        name: "microfrontend_repository_rename",
        title: "Rename repository",
        description:
            "Renames the git repository of a microfrontend at its provider (GitHub, GitLab, Azure DevOps) and updates the repository name and clone URLs the console keeps. The microfrontend's own name and slug do not change. Local clones must point their remote to the new URL: GitHub and GitLab redirect the old one, Azure DevOps does not.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE_EXTERNAL, idempotentHint: true },
        // Every clone and pipeline of the team follows the repository URL: the user says yes first.
        requiresConfirmation: true,
        inputSchema: z.object({
            microfrontendId,
            name: z
                .string()
                .trim()
                .refine(isValidRepositoryName, "letters, digits, '.', '_' and '-' (up to 100), starting with a letter or a digit, not ending with '.', '.git' or '.atom'")
                .describe("New name of the repository at the provider, ending in -fe, e.g. checkout-fe")
        }),
        run: (args, { principal }) => new RepositoryRenameService(principal).renameMicrofrontendRepository(args.microfrontendId, args.name)
    }),
    defineTool({
        name: "microfrontends_detect_stacks",
        title: "Detect stacks",
        description: "Reads each linked repository to detect framework and bundler (or the single-spa / micro-lc integration model), and stores what it finds (manual choices are kept).",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new StackDetectionService(principal).detectForProject(projectId)
    }),
    defineTool({
        name: "microfrontend_set_stack",
        title: "Set stack",
        description: "Sets framework and bundler (or integration model: SINGLE_SPA, MICRO_LC, WEBCOMPONENT) of a microfrontend by hand. Detection never overwrites a manual choice.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ microfrontendId, framework: z.enum(MicrofrontendFramework).optional(), compiler: z.enum(MicrofrontendCompiler).optional() }),
        run: (args, { principal }) => new StackDetectionService(principal).setManualStack(args.microfrontendId, args.framework, args.compiler)
    })
]
