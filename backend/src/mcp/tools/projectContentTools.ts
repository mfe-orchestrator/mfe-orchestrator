import { z } from "zod"
import { createBusinessException } from "../../errors/BusinessException"
import EnvironmentService from "../../service/EnvironmentService"
import MicrofrontendService from "../../service/MicrofrontendService"
import { EnvironmentDTO } from "../../types/EnvironmentDTO"
import { MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, objectId, WRITE } from "../toolDefinition"
import { environmentFields } from "./environmentTools"

/** Console-only tools for what the console does on many items at once and the canvas layout. */
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
    })
]
