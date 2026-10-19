import { z } from "zod"
import { createBusinessException } from "../../errors/BusinessException"
import EnvironmentService from "../../service/EnvironmentService"
import MarketService from "../../service/MarketService"
import MicrofrontendService from "../../service/MicrofrontendService"
import { EnvironmentDTO } from "../../types/EnvironmentDTO"
import MicrofrontendDTO from "../../types/MicrofrontendDTO"
import { MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, objectId, WRITE, WRITE_EXTERNAL } from "../toolDefinition"
import { environmentFields } from "./environmentTools"
import { createSchema, ensureReferencesBelongToProject } from "./microfrontendTools"

const scaffoldSchema = createSchema.omit({ codeRepository: true }).extend({
    template: z.string().trim().min(1).describe("Slug of the template, from templates_list"),
    codeRepositoryId: objectId("Id of a code repository connection of this project, from code_repositories_list: the new repository is created there"),
    repositoryName: z
        .string()
        .trim()
        .min(3)
        .max(100)
        .optional()
        .describe("Name of the new repository, ending in -fe (e.g. checkout-fe): always pass it, the microfrontend's slug is used as is when omitted"),
    private: z.boolean().optional().describe("Create the repository as private (default false)"),
    gitlab: z
        .object({
            groupId: z.number().int().optional().describe("Id of the GitLab group to create the repository in"),
            groupPath: z.string().optional().describe("Path of the GitLab group")
        })
        .optional()
        .describe("GitLab connections only: the group of the new repository, the connection's own group when omitted")
})

/**
 * Console-only tools for what the console does on many items at once, the canvas layout, and
 * scaffolding a repository from a template (which creates the repository at the provider with the
 * connection's stored credentials and, on GitHub, stores a deploy API key in its secrets: neither
 * secret is ever part of the input or of the result).
 */
export const projectContentTools = [
    defineTool({
        name: "environments_create_bulk",
        title: "Create environments",
        description: "Adds several environments to the project in one go, appended after the existing ones in the order given.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: WRITE,
        inputSchema: z.object({ environments: z.array(z.object(environmentFields)).min(1).max(20).describe("The environments to create") }),
        run: (args, { principal, projectId }) => new EnvironmentService(principal).createBulk(args.environments as EnvironmentDTO[], projectId)
    }),
    defineTool({
        name: "environments_delete_bulk",
        title: "Delete environments",
        description: "Deletes several environments together with their deployments, canary enrolments and global variable values.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ environmentIds: z.array(objectId("Id of an environment, from environments_list")).min(1).max(50) }),
        run: async (args, { principal }) => {
            await new EnvironmentService(principal).deleteMultiple(args.environmentIds)
            return { deleted: args.environmentIds.length }
        }
    }),
    defineTool({
        name: "microfrontends_delete_bulk",
        title: "Delete microfrontends",
        description: "Removes several microfrontends from the project. Deployments already made keep their snapshot.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ microfrontendIds: z.array(objectId("Id of a microfrontend, from microfrontends_list")).min(1).max(50) }),
        run: async (args, { principal }) => ({ deletedCount: await new MicrofrontendService(principal).bulkDelete(args.microfrontendIds) })
    }),
    defineTool({
        name: "microfrontend_canvas_set",
        title: "Move microfrontend on the canvas",
        description: "Moves a microfrontend's box on the project canvas, resizes it, or both. Coordinates and sizes are canvas pixels.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({
            microfrontendId: objectId("Id of the microfrontend, from microfrontends_list"),
            position: z.object({ x: z.number(), y: z.number() }).optional().describe("New top-left corner of the box"),
            size: z.object({ width: z.number().positive(), height: z.number().positive() }).optional().describe("New size of the box")
        }),
        run: async (args, { principal }) => {
            if (!args.position && !args.size) {
                throw createBusinessException({ code: "CANVAS_NOTHING_TO_SET", message: "Pass position, size or both" })
            }
            const service = new MicrofrontendService(principal)
            let microfrontend = args.position ? await service.setPosition(args.microfrontendId, args.position.x, args.position.y) : undefined
            if (args.size) {
                microfrontend = await service.setDimension(args.microfrontendId, args.size.width, args.size.height)
            }
            return { id: args.microfrontendId, position: microfrontend?.position }
        }
    }),
    defineTool({
        name: "microfrontend_scaffold",
        title: "Create microfrontend from template",
        description:
            "Adds a microfrontend whose code repository is created at the provider from a marketplace template, through a code repository connection of the project (with its CI pipeline and, on GitHub, the deploy secret). Use microfrontend_create instead to link a repository that already exists.",
        scope: MCP_SCOPE_WRITE,
        consoleOnly: true,
        annotations: WRITE_EXTERNAL,
        inputSchema: scaffoldSchema,
        run: async ({ template, codeRepositoryId, repositoryName, private: isPrivate, gitlab, ...fields }, context) => {
            const codeRepository = { enabled: true, codeRepositoryId, repositoryId: "", gitlab }
            await ensureReferencesBelongToProject({ ...fields, codeRepository }, context)
            // Checked first: an unknown slug would otherwise create an empty repository
            if (!(await new MarketService(context.principal).getSingle(template))) {
                throw createBusinessException({ code: "TEMPLATE_NOT_FOUND", message: `There is no template "${template}": see templates_list` })
            }
            const microfrontend = { ...fields, codeRepository: { ...codeRepository, createData: { name: repositoryName ?? fields.slug, private: isPrivate, template } } }
            return new MicrofrontendService(context.principal).create(microfrontend as unknown as MicrofrontendDTO, context.projectId)
        }
    })
]
