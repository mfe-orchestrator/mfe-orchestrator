import { z } from "zod"
import { createBusinessException } from "../../errors/BusinessException"
import { CONTEXT_MAX_LENGTH } from "../../models/ProjectModel"
import MarketService from "../../service/MarketService"
import ProjectService, { ContextFocus } from "../../service/ProjectService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { defineTool, NO_INPUT, objectId, READ_ONLY, WRITE } from "../toolDefinition"

/** The focus of context_get, at most one of the ids: none reads the whole project. */
const toFocus = ({ microfrontendId, serviceId, domainId }: { microfrontendId?: string; serviceId?: string; domainId?: string }): ContextFocus | undefined => {
    const given = [microfrontendId, serviceId, domainId].filter(Boolean).length
    if (given > 1) {
        throw createBusinessException({ code: "CONTEXT_FOCUS_INVALID", message: "Pass at most one of microfrontendId, serviceId and domainId" })
    }
    if (microfrontendId) return { microfrontendId }
    if (serviceId) return { serviceId }
    if (domainId) return { domainId }
    return undefined
}

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
        name: "context_get",
        title: "Get project context",
        description:
            "The notes the team wrote for AI agents: the context of the project (conventions, rules shared by everything) and the context of each functional domain, microfrontend (frontend) and service (backend) that has one. " +
            "Read it before working on the project or on its code. Working on one microfrontend or service, pass its id: you get its context, the one of its domain and the project one. " +
            "Working on a domain, pass domainId: you get its context, the one of each of its microfrontends and services and the project one. Without ids, every context of the project.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({
            microfrontendId: objectId("Id of the microfrontend you work on, from microfrontends_list").optional(),
            serviceId: objectId("Id of the service you work on, from services_list").optional(),
            domainId: objectId("Id of the domain you work on, from domains_list").optional()
        }),
        run: (args, { principal, projectId }) => new ProjectService(principal).getContext(projectId, toFocus(args))
    }),
    defineTool({
        name: "project_update",
        title: "Update project",
        description: "Renames the project or changes its description or its context (markdown notes for AI agents, replaced as a whole). Pass description or context null to remove it.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({
            name: z.string().min(1).max(255).optional(),
            description: z.string().max(2000).nullable().optional(),
            context: z.string().max(CONTEXT_MAX_LENGTH).nullable().optional()
        }),
        run: (args, { principal, projectId }) => new ProjectService(principal).update(projectId, args)
    }),
    defineTool({
        name: "templates_list",
        title: "List templates",
        description: 'The marketplace templates a repository can be scaffolded from: those of type "service" with service_scaffold, the others with microfrontend_scaffold.',
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal }) => new MarketService(principal).getAll()
    })
]
