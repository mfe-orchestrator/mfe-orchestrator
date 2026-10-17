import { z } from "zod"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { CONTEXT_MAX_LENGTH } from "../../models/ProjectModel"
import ServiceService from "../../service/ServiceService"
import ServiceDTO from "../../types/ServiceDTO"
import { SERVICE_HTTP_PATH, SERVICE_SLUG } from "../../types/ServiceStack"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, McpToolContext, objectId, READ_ONLY, WRITE } from "../toolDefinition"
import { domainFilter, filterByDomain, memberDomainId } from "./domainTools"
import { ensureReferencesBelongToProject, createSchema as microfrontendCreateSchema } from "./microfrontendTools"

const serviceId = objectId("Id of the service, from services_list")

const httpPath = z.string().regex(SERVICE_HTTP_PATH, 'starts with "/", at most 256 characters, no whitespace')

/**
 * The fields a backend service can be created or edited with.
 *
 * Deliberately narrower than the console route, as for microfrontends: no `projectId` (the token's
 * project is the only one), no `codeRepository.createData` (scaffolding a repository at the provider
 * stays in the console), and nothing the CI or a template sets (`version`, `template`, `stack`).
 * Linking an existing repository is allowed, checked against the project first.
 */
const serviceFields = {
    name: z.string().min(1).max(255),
    slug: z.string().regex(SERVICE_SLUG, "2 to 50 lowercase letters, digits or dashes, not starting with a dash"),
    description: z.string().max(2000).optional(),
    domainId: memberDomainId,
    context: z.string().max(CONTEXT_MAX_LENGTH).optional().describe("Markdown notes for AI agents about this service, replaced as a whole"),
    codeRepository: microfrontendCreateSchema.shape.codeRepository,
    image: z
        .object({ repository: z.string().max(500).optional() })
        .optional()
        .describe("Image repository without tag, e.g. ghcr.io/acme/orders-api. Learnt from the first version the CI registers when not set"),
    port: z.number().int().min(1).max(65535).optional().describe("Port the container listens on, 8080 when omitted"),
    livenessPath: httpPath.optional().describe("Liveness probe path, /health/live when omitted"),
    readinessPath: httpPath.optional().describe("Readiness probe path, /health/ready when omitted"),
    docsPath: httpPath.nullable().optional().describe("Path of the API documentation UI, e.g. /docs; null when the service has none"),
    openApiPath: httpPath.nullable().optional().describe("Path of the OpenAPI spec, e.g. /openapi.json; null when the service has none"),
    env: z
        .array(
            z.object({
                name: z
                    .string()
                    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "letters, digits and underscores, not starting with a digit")
                    .max(255),
                required: z.boolean().optional(),
                secret: z.boolean().optional(),
                description: z.string().max(2000).optional()
            })
        )
        .max(200)
        .optional()
        .describe("Variables the image reads from its environment: names only, never values. Replaced as a whole")
}

const createSchema = z.object(serviceFields)
// The slug is in the registration URL the service's CI calls: fixed after creation, as in the console
const updateSchema = z.object({ serviceId, ...createSchema.omit({ slug: true }).partial().shape })

const getExisting = async (id: string, context: McpToolContext) => {
    const service = await new ServiceService(context.principal).getById(id)
    if (!service) {
        throw new EntityNotFoundError(id)
    }
    return service
}

export const serviceTools = [
    defineTool({
        name: "services_list",
        title: "List services",
        description: "Every backend service of the project, with its latest version, image, port, probes, environment variables, repository and domainId. Pass domainId to list one domain only.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ domainId: domainFilter }),
        run: async (args, context) => filterByDomain(await new ServiceService(context.principal).getByProjectId(context.projectId), args.domainId, context)
    }),
    defineTool({
        name: "service_get",
        title: "Get service",
        description: "One backend service of the project.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ serviceId }),
        run: (args, context) => getExisting(args.serviceId, context)
    }),
    defineTool({
        name: "service_create",
        title: "Create service",
        description:
            "Adds a backend service (a container image built by the CI of its repository) to the project. A code repository can be linked if it already exists at the provider; creating a new repository from a template is only possible from the console.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE,
        inputSchema: createSchema,
        run: async (args, context) => {
            await ensureReferencesBelongToProject(args, context)
            return new ServiceService(context.principal).create(args as unknown as ServiceDTO, context.projectId)
        }
    }),
    defineTool({
        name: "service_update",
        title: "Update service",
        description: "Changes the given fields of a backend service. Nested objects (codeRepository, image) and the env list are replaced as a whole.",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: updateSchema,
        run: async ({ serviceId: id, ...changes }, context) => {
            await getExisting(id, context)
            await ensureReferencesBelongToProject(changes, context)
            return new ServiceService(context.principal).update(id, changes as unknown as ServiceDTO)
        }
    }),
    defineTool({
        name: "service_delete",
        title: "Delete service",
        description:
            "Removes a backend service from the project together with the versions its CI registered, its AI change requests and its local workspace clone. Its repository at the provider is left untouched.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ serviceId }),
        run: (args, { principal }) => new ServiceService(principal).delete(args.serviceId)
    })
]
