import { z } from "zod"
import { DOMAIN_LINK_LABEL_MAX_LENGTH } from "../../models/DomainLinkModel"
import DomainLinkService from "../../service/DomainLinkService"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, NO_INPUT, objectId, READ_ONLY, WRITE } from "../toolDefinition"

export const domainLinkTools = [
    defineTool({
        name: "domain_links_list",
        title: "List domain links",
        description:
            "The relations the team drew by hand between the functional domains of the project, each from sourceDomainId to targetDomainId with an optional label. The links between microfrontends and services of different domains are not here: read them from microfrontends_list.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => new DomainLinkService(principal).getByProjectId(projectId)
    }),
    defineTool({
        name: "domain_link_create",
        title: "Link domains",
        description: "Draws a relation from one functional domain of the project to another, e.g. Payments uses Checkout. One way: the link back is another relation.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE,
        inputSchema: z.object({
            sourceDomainId: objectId("Id of the domain the relation starts from, from domains_list"),
            targetDomainId: objectId("Id of the domain the relation goes to, from domains_list"),
            label: z.string().max(DOMAIN_LINK_LABEL_MAX_LENGTH).optional().describe('What the relation is, e.g. "uses" or "publishes events to"')
        }),
        run: (args, { principal, projectId }) => new DomainLinkService(principal).create(args, projectId)
    }),
    defineTool({
        name: "domain_link_delete",
        title: "Unlink domains",
        description: "Deletes a relation drawn between two functional domains. The domains and their members are kept.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ domainLinkId: objectId("Id of the relation, from domain_links_list") }),
        run: (args, { principal }) => new DomainLinkService(principal).delete(args.domainLinkId)
    })
]
