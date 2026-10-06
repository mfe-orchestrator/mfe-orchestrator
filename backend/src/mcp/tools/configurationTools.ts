import { z } from "zod"
import BuildStatusService from "../../service/BuildStatusService"
import FederationIntegrationService, { IntegrationScope } from "../../service/FederationIntegrationService"
import GlobalVariablesService from "../../service/GlobalVariablesService"
import MicrofrontendDependencyService from "../../service/MicrofrontendDependencyService"
import { StorageService } from "../../service/StorageService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, DESTRUCTIVE_EXTERNAL, defineTool, NO_INPUT, objectId, READ_ONLY, READ_ONLY_EXTERNAL, WRITE } from "../toolDefinition"

const storageId = objectId("Id of the storage")

const environmentValues = z
    .array(z.object({ environmentId: objectId("Id of an environment of the project"), value: z.string() }))
    .min(1)
    .describe("The value of the variable in each environment")

const branchesByMicrofrontend = z.record(z.string(), z.string()).optional().describe("Branch to read per microfrontend id; the default branch otherwise")

const alignmentRequest = z.object({
    branches: branchesByMicrofrontend,
    microfrontendIds: z.array(objectId("Id of a microfrontend")).optional().describe("Restricts the alignment to these microfrontends"),
    packages: z.array(z.string().min(1)).optional().describe("Restricts the alignment to these npm packages"),
    branchName: z.string().min(1).optional().describe("Branch the commits land on"),
    commitMessage: z.string().min(1).max(500).optional()
})

const integrationScope = z.enum(IntegrationScope).describe("MODULE_FEDERATION wires the remotes into the hosts, GLOBAL_VARIABLES adds the runtime configuration script")

export const configurationTools = [
    defineTool({
        name: "build_status_get",
        title: "Get build status",
        description: "The latest CI runs of every microfrontend, read from the git providers, and which version each environment serves.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new BuildStatusService(principal).getByProjectId(projectId)
    }),
    defineTool({
        name: "global_variables_list",
        title: "List global variables",
        description: "The runtime variables of the project, one row per environment.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new GlobalVariablesService(principal).getAllByProjectId(projectId)
    }),
    defineTool({
        name: "global_variable_create",
        title: "Create global variable",
        description: "Adds a runtime variable to the project. Values reach the browsers of the host application: never put secrets in them.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE,
        inputSchema: z.object({ key: z.string().min(1).max(255), values: environmentValues }),
        run: (args, { principal, projectId }) => new GlobalVariablesService(principal).createForProject(args, projectId)
    }),
    defineTool({
        name: "global_variable_update",
        title: "Update global variable",
        description: "Renames a variable and/or changes its values per environment.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ originalKey: z.string().min(1), key: z.string().min(1).max(255), values: environmentValues }),
        run: (args, { principal, projectId }) => new GlobalVariablesService(principal).updateByProjectId(args, projectId)
    }),
    defineTool({
        name: "global_variable_delete",
        title: "Delete global variable",
        description: "Deletes a variable from every environment of the project.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ key: z.string().min(1) }),
        run: (args, { principal, projectId }) => new GlobalVariablesService(principal).deleteByProjectId(args.key, projectId)
    }),
    defineTool({
        name: "dependencies_report",
        title: "Dependency report",
        description: "Reads package.json of every linked repository and reports outdated and misaligned dependencies against the npm registry.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z.object({ branches: branchesByMicrofrontend }),
        run: (args, { principal, projectId }) => new MicrofrontendDependencyService(principal).getReport(projectId, args)
    }),
    defineTool({
        name: "dependencies_alignment_plan",
        title: "Plan dependency alignment",
        description: "Dry run: which package.json files would change to align shared dependencies across microfrontends.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: alignmentRequest,
        run: (args, { principal, projectId }) => new MicrofrontendDependencyService(principal).getAlignmentPlan(projectId, args)
    }),
    defineTool({
        name: "dependencies_alignment_apply",
        title: "Apply dependency alignment",
        description: "Commits the dependency alignment to the repositories. Run dependencies_alignment_plan first and show it to the user.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE_EXTERNAL,
        inputSchema: alignmentRequest,
        run: (args, { principal, projectId }) => new MicrofrontendDependencyService(principal).applyAlignment(projectId, args)
    }),
    defineTool({
        name: "integration_plan",
        title: "Plan integration",
        description: "Dry run: what wiring module federation, or the runtime configuration script, would change in each repository.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z.object({ scope: integrationScope }),
        run: (args, { principal, projectId }) => new FederationIntegrationService(principal).getPlan(projectId, args.scope)
    }),
    defineTool({
        name: "integration_apply",
        title: "Apply integration",
        description: "Commits the planned integration changes to the default branch of the selected microfrontends' repositories. Run integration_plan first.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE_EXTERNAL,
        inputSchema: z.object({ scope: integrationScope, microfrontendIds: z.array(objectId("Id of a microfrontend")).min(1) }),
        run: (args, { principal, projectId }) => new FederationIntegrationService(principal).apply(projectId, { microfrontendIds: args.microfrontendIds }, args.scope)
    }),
    defineTool({
        name: "storages_list",
        title: "List storages",
        description: "The storages microfrontend bundles can be hosted on. Credentials are masked; creating or editing a storage is only possible from the console.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: async (_args, { principal, projectId }) => (await new StorageService(principal).getByProjectId(projectId)).map(storage => storage.toFrontendObject())
    }),
    defineTool({
        name: "storage_get",
        title: "Get storage",
        description: "One storage of the project. Credentials are masked.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ storageId }),
        run: async (args, { principal }) => (await new StorageService(principal).getById(args.storageId)).toFrontendObject()
    }),
    defineTool({
        name: "storage_set_default",
        title: "Set default storage",
        description: "Makes a storage the project's default one.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({ storageId }),
        run: async (args, { principal }) => (await new StorageService(principal).makeDefault(args.storageId)).toFrontendObject()
    }),
    defineTool({
        name: "storage_delete",
        title: "Delete storage",
        description: "Deletes a storage from the project. The files in the bucket are not touched.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ storageId }),
        run: async (args, { principal }) => {
            await new StorageService(principal).delete(args.storageId)
            return { deleted: true }
        }
    })
]
