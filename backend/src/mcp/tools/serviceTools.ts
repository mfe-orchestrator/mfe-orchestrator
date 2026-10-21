import { z } from "zod"
import { createBusinessException } from "../../errors/BusinessException"
import { EntityNotFoundError } from "../../errors/EntityNotFoundError"
import { CONTEXT_MAX_LENGTH } from "../../models/ProjectModel"
import ProjectService from "../../service/ProjectService"
import ServiceService from "../../service/ServiceService"
import ServiceDTO from "../../types/ServiceDTO"
import { SERVICE_SLUG, SERVICE_VERSION } from "../../types/ServiceStack"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, McpToolContext, objectId, READ_ONLY, WRITE, WRITE_EXTERNAL } from "../toolDefinition"
import { domainFilter, filterByDomain, memberDomainId } from "./domainTools"
import { containerFields, ensureReferencesBelongToProject, createSchema as microfrontendCreateSchema } from "./microfrontendTools"

const serviceId = objectId("Id of the service, from services_list")

/**
 * The fields a backend service can be created or edited with.
 *
 * Deliberately narrower than the console route, as for microfrontends: no `projectId` (the token's
 * project is the only one), no `codeRepository.createData` (scaffolding a repository at the provider
 * is `service_scaffold`'s), and nothing the CI or a template sets (`version`, `template`, `stack`).
 * Linking an existing repository is allowed, checked against the project first.
 */
const serviceFields = {
    name: z.string().min(1).max(255),
    slug: z.string().regex(SERVICE_SLUG, "2 to 50 lowercase letters, digits or dashes, not starting with a dash"),
    description: z.string().max(2000).optional(),
    domainId: memberDomainId,
    context: z.string().max(CONTEXT_MAX_LENGTH).optional().describe("Markdown notes for AI agents about this service, replaced as a whole"),
    codeRepository: microfrontendCreateSchema.shape.codeRepository,
    ...containerFields
}

export const createSchema = z.object(serviceFields)
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
        description:
            "Every backend service of the project, with its latest version, image, port, probes, base URL per environment, environment variables, repository and domainId. Pass domainId to list one domain only.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ domainId: domainFilter }),
        run: async (args, context) => filterByDomain(await new ServiceService(context.principal).getByProjectId(context.projectId), args.domainId, context)
    }),
    defineTool({
        name: "service_get",
        title: "Get service",
        description: "One backend service of the project, with aiContext: what the team wrote for AI agents about it, its domain and the project. Follow it when working on its code.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ serviceId }),
        run: async (args, context) => {
            const service = await getExisting(args.serviceId, context)
            const aiContext = await new ProjectService(context.principal).getContext(context.projectId, { serviceId: args.serviceId })
            return { ...service.toObject(), aiContext }
        }
    }),
    defineTool({
        name: "service_versions",
        title: "List service versions",
        description: "The versions of a backend service its CI has registered (an image tag each) and can be deployed.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ serviceId }),
        run: (args, { principal }) => new ServiceService(principal).getVersionsById(args.serviceId)
    }),
    defineTool({
        name: "service_trigger_build",
        title: "Trigger service build",
        description: "Tags the given branch of the service's repository with the version, which starts its CI pipeline: it builds the image and registers the version.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        inputSchema: z.object({
            serviceId,
            version: z.string().regex(SERVICE_VERSION, "letters, digits, dots, dashes and underscores, at most 128").describe("Version to tag, e.g. 1.4.0: it becomes the image tag"),
            branch: z.string().min(1).max(255).optional().describe("Branch to tag, main when omitted")
        }),
        run: async (args, context) => {
            // Without a linked repository the service tags nothing: say so rather than answer it started
            if (!(await getExisting(args.serviceId, context)).codeRepository?.enabled) {
                throw createBusinessException({
                    code: "SERVICE_REPOSITORY_MISSING",
                    message: "The service has no linked code repository to tag: link one with service_update or create one with service_scaffold"
                })
            }
            await new ServiceService(context.principal).build(args.serviceId, args.version, args.branch)
            return { triggered: true }
        }
    }),
    defineTool({
        name: "service_create",
        title: "Create service",
        description:
            "Adds a backend service (a container image built by the CI of its repository) to the project. A code repository can be linked if it already exists at the provider; use service_scaffold to create a new one from a template.",
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
        description: "Changes the given fields of a backend service. Nested objects (codeRepository, image) and the env and urls lists are replaced as a whole.",
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
