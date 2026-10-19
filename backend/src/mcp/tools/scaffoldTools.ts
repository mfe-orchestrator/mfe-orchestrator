import { z } from "zod"
import { createBusinessException } from "../../errors/BusinessException"
import MarketService from "../../service/MarketService"
import MicrofrontendService from "../../service/MicrofrontendService"
import { isValidRepositoryName } from "../../service/RepositoryRenameService"
import ServiceService from "../../service/ServiceService"
import MicrofrontendDTO from "../../types/MicrofrontendDTO"
import ServiceDTO from "../../types/ServiceDTO"
import { MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { defineTool, McpToolContext, objectId, WRITE_EXTERNAL } from "../toolDefinition"
import { ensureReferencesBelongToProject, createSchema as microfrontendCreateSchema } from "./microfrontendTools"
import { createSchema as serviceCreateSchema } from "./serviceTools"

/**
 * Where and how the new repository is created: the connection's credentials are never part of the
 * input. Its name ends in -fe for a frontend and in -be for a backend service, as the server
 * instructions tell agents.
 */
const repositoryToCreate = (example: string) => ({
    template: z.string().trim().min(1).describe("Slug of the template, from templates_list"),
    codeRepositoryId: objectId("Id of a code repository connection of this project, from code_repositories_list: the new repository is created there"),
    repositoryName: z
        .string()
        .trim()
        .min(3)
        .max(100)
        .refine(isValidRepositoryName, "letters, digits, '.', '_' and '-', starting with a letter or a digit, not ending with '.', '.git' or '.atom'")
        .optional()
        .describe(`Name of the new repository, ending in -${example.split("-").pop()} (e.g. ${example}): always pass it, the slug is used as is when omitted`),
    private: z.boolean().optional().describe("Create the repository as private (default false)"),
    gitlab: z
        .object({ groupId: z.number().int().describe("Id of the GitLab group to create the repository in") })
        .optional()
        .describe("GitLab connections only: the group of the new repository, the connection's own group when omitted")
})

type RepositoryToCreate = z.infer<z.ZodObject<ReturnType<typeof repositoryToCreate>>>

/**
 * The member to create with the repository it asks for, once the connection and the domain are
 * checked against the project and the template is known: an unknown slug would otherwise create an
 * empty repository at the provider.
 */
const withRepositoryToCreate = async <Fields extends { slug: string; domainId?: string | null }>(
    { template, codeRepositoryId, repositoryName, private: isPrivate, gitlab, ...fields }: Fields & RepositoryToCreate,
    context: McpToolContext
) => {
    const codeRepository = { enabled: true, codeRepositoryId, repositoryId: "", gitlab }
    await ensureReferencesBelongToProject({ ...fields, codeRepository }, context)
    if (!(await new MarketService(context.principal).getSingle(template))) {
        throw createBusinessException({ code: "TEMPLATE_NOT_FOUND", message: `There is no template "${template}": see templates_list` })
    }
    return { ...fields, codeRepository: { ...codeRepository, createData: { name: repositoryName ?? fields.slug, private: isPrivate, template } } }
}

/**
 * Scaffolding a repository from a marketplace template: the repository is created at the provider
 * with the connection's stored credentials, with its CI pipeline and, on GitHub, a deploy API key in
 * its secrets. Neither secret is ever part of the input or of the result. It cannot be undone from
 * here, so the console assistant asks the user first.
 */
export const scaffoldTools = [
    defineTool({
        name: "microfrontend_scaffold",
        title: "Create microfrontend from template",
        description:
            "Adds a microfrontend whose code repository is created at the provider from a marketplace template (a microfrontend one), through a code repository connection of the project (with its CI pipeline and, on GitHub, the deploy secret). Use microfrontend_create instead to link a repository that already exists.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        requiresConfirmation: true,
        inputSchema: microfrontendCreateSchema.omit({ codeRepository: true }).extend(repositoryToCreate("checkout-fe")),
        run: async (args, context) => new MicrofrontendService(context.principal).create((await withRepositoryToCreate(args, context)) as unknown as MicrofrontendDTO, context.projectId)
    }),
    defineTool({
        name: "service_scaffold",
        title: "Create service from template",
        description:
            "Adds a backend service whose code repository is created at the provider from a marketplace template (a service one), through a code repository connection of the project (with its CI pipeline and, on GitHub, the deploy secret). Port and probe paths left out come from the template. Use service_create instead to link a repository that already exists.",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE_EXTERNAL,
        requiresConfirmation: true,
        inputSchema: serviceCreateSchema.omit({ codeRepository: true }).extend(repositoryToCreate("orders-be")),
        run: async (args, context) => new ServiceService(context.principal).create((await withRepositoryToCreate(args, context)) as unknown as ServiceDTO, context.projectId)
    })
]
