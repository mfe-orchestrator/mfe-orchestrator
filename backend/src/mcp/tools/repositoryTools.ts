import { z } from "zod"
import CodeRepositoryImportService from "../../service/CodeRepositoryImportService"
import CodeRepositoryService from "../../service/CodeRepositoryService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, NO_INPUT, objectId, READ_ONLY, READ_ONLY_EXTERNAL, WRITE, WRITE_EXTERNAL } from "../toolDefinition"

/**
 * Code repository connections. Creating or editing one takes a provider token as input, so those
 * stay in the console: a secret typed into a chat ends up in the client's history. Everything
 * returned goes through `toFrontendObject`, which masks the stored token.
 */
const codeRepositoryId = objectId("Id of the code repository connection")

export const repositoryTools = [
    defineTool({
        name: "code_repositories_list",
        title: "List code repository connections",
        description: "The active GitHub, GitLab and Azure DevOps connections of the project. Tokens are masked.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: async (_args, { principal, projectId }) => (await new CodeRepositoryService(principal).getByProjectId(projectId)).map(repository => repository.toFrontendObject())
    }),
    defineTool({
        name: "code_repository_get",
        title: "Get code repository connection",
        description: "One code repository connection. The token is masked.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ codeRepositoryId }),
        run: async (args, { principal }) => (await new CodeRepositoryService(principal).findById(args.codeRepositoryId))?.toFrontendObject() ?? null
    }),
    defineTool({
        name: "code_repository_branches",
        title: "List branches",
        description: "The branches of a repository reachable through a connection.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z.object({ codeRepositoryId, repositoryId: z.string().min(1).describe("Id (or path, on GitLab) of the repository at the provider") }),
        run: (args, { principal }) => new CodeRepositoryService(principal).getBranches(args.codeRepositoryId, args.repositoryId)
    }),
    defineTool({
        name: "code_repository_remote_repositories",
        title: "List remote repositories",
        description: "The repositories the connection can see at the provider.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z.object({ codeRepositoryId, groupPath: z.string().optional(), groupId: z.number().int().optional().describe("GitLab only: group to list") }),
        run: (args, { principal }) => new CodeRepositoryService(principal).getRepositories(args.codeRepositoryId, args.groupPath, args.groupId)
    }),
    defineTool({
        name: "code_repository_check_name",
        title: "Check repository name",
        description: "Whether a repository name is still free at the provider.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z.object({ codeRepositoryId, name: z.string().min(1).max(255), groupPath: z.string().optional(), groupId: z.number().int().optional() }),
        run: async (args, { principal }) => ({
            available: await new CodeRepositoryService(principal).isRepositoryNameAvailable(args.codeRepositoryId, args.name, args.groupPath, args.groupId)
        })
    }),
    defineTool({
        name: "code_repository_set_default",
        title: "Set default connection",
        description: "Makes a connection the project's default one.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ codeRepositoryId }),
        run: async (args, { principal }) => {
            await new CodeRepositoryService(principal).makeDefault(args.codeRepositoryId)
            return { default: true }
        }
    }),
    defineTool({
        name: "code_repository_set_active",
        title: "Activate or deactivate connection",
        description: "Activates or deactivates a connection. A deactivated one is hidden from the lists but kept.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ codeRepositoryId, active: z.boolean() }),
        run: async (args, { principal }) => {
            const service = new CodeRepositoryService(principal)
            const repository = args.active ? await service.activate(args.codeRepositoryId) : await service.deactivate(args.codeRepositoryId)
            return repository?.toFrontendObject() ?? null
        }
    }),
    defineTool({
        name: "code_repository_delete",
        title: "Delete connection",
        description: "Deletes a code repository connection. The repositories at the provider are not touched.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ codeRepositoryId }),
        run: async (args, { principal }) => {
            await new CodeRepositoryService(principal).delete(args.codeRepositoryId)
            return { deleted: true }
        }
    }),
    defineTool({
        name: "code_repository_importable",
        title: "List importable repositories",
        description: "The repositories of a connection that are not microfrontends of the project yet.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z.object({ codeRepositoryId, groupId: z.number().int().optional().describe("GitLab only: group to list") }),
        run: (args, { principal }) => new CodeRepositoryImportService(principal).getImportableRepositories(args.codeRepositoryId, args.groupId)
    }),
    defineTool({
        name: "code_repository_import",
        title: "Import repositories",
        description: "Creates one microfrontend per repository of the connection. With no repositoryIds, every repository not imported yet is taken.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            codeRepositoryId,
            repositoryIds: z.array(z.string().min(1)).optional(),
            groupId: z.number().int().optional(),
            version: z.string().min(1).max(100).optional().describe("Initial version of the created microfrontends")
        }),
        run: ({ codeRepositoryId: id, ...body }, { principal }) => new CodeRepositoryImportService(principal).importRepositories(id, body)
    })
]
