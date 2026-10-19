import { z } from "zod"
import DomainDeploymentService from "../../service/DomainDeploymentService"
import { MCP_SCOPE_READ } from "../../utils/oauthConfig"
import { defineTool, objectId, READ_ONLY } from "../toolDefinition"

export const domainDeploymentTools = [
    defineTool({
        name: "domain_deployments_get",
        title: "Get deployed versions by domain",
        description:
            "Which version of each microfrontend (frontend) and service (backend) runs in each environment, by functional domain, environments in their order. " +
            "Frontend versions are the ones frozen in the active deployment of the environment (null: never deployed there, or not in that deployment; canary only when enabled). " +
            "Backend versions are the latest ones the customer's deploy pipeline reported to the orchestrator, which does not deploy services itself (null: none reported). " +
            'With domainId, that domain only; without it, every domain of the project plus a "domain": null entry for the members in no domain.',
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({
            domainId: objectId("Id of the domain, from domains_list").optional().describe("Id of the domain, from domains_list; omitted, the whole project")
        }),
        run: (args, { principal, projectId }) => {
            const service = new DomainDeploymentService(principal)
            return args.domainId ? service.getByDomainId(args.domainId) : service.getByProjectId(projectId)
        }
    })
]
