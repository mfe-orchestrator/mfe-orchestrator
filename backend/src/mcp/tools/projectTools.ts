import { z } from "zod"
import MarketService from "../../service/MarketService"
import ProjectService from "../../service/ProjectService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { defineTool, NO_INPUT, READ_ONLY, WRITE } from "../toolDefinition"

export const projectTools = [
    defineTool({
        name: "project_get",
        title: "Get project",
        description: "The project this connection is bound to, with how many environments, microfrontends, members, storages and code repositories it has.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new ProjectService(principal).getSummary(projectId)
    }),
    defineTool({
        name: "project_update",
        title: "Update project",
        description: "Renames the project or changes its description. Pass description null to remove it.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({
            name: z.string().min(1).max(255).optional(),
            description: z.string().max(2000).nullable().optional()
        }),
        run: (args, { principal, projectId }) => new ProjectService(principal).update(projectId, args)
    }),
    defineTool({
        name: "templates_list",
        title: "List microfrontend templates",
        description: "The marketplace templates a microfrontend repository can be scaffolded from (scaffolding itself is done from the console).",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal }) => new MarketService(principal).getAll()
    })
]
