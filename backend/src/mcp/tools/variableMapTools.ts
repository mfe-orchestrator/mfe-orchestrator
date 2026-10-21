import { z } from "zod"
import { VariableMapService } from "../../service/VariableMapService"
import VariableMapDTO, { VARIABLE_MAP_NAME } from "../../types/VariableMapDTO"
import { MCP_SCOPE_READ, MCP_SCOPE_WRITE } from "../../utils/oauthConfig"
import { DESTRUCTIVE, defineTool, NO_INPUT, objectId, READ_ONLY, WRITE } from "../toolDefinition"

const configMapId = objectId("Id of the config map, from config_maps_list")
const secretId = objectId("Id of the secret, from secrets_list")

const entries = z
    .array(
        z.object({
            key: z.string().min(1).max(255).describe("Name of the environment variable it becomes, e.g. LOG_LEVEL"),
            values: z
                .array(z.object({ environmentId: objectId("Id of an environment of the project, from environments_list"), value: z.string().max(10_000).optional() }))
                .optional()
                .describe("The value in each environment; a blank or missing one leaves the key unset there")
        })
    )
    .max(200)
    .describe("The keys of the map, replaced as a whole")

const configMaps = (principal: ConstructorParameters<typeof VariableMapService>[1]) => new VariableMapService("configMap", principal)
const secrets = (principal: ConstructorParameters<typeof VariableMapService>[1]) => new VariableMapService("secret", principal)

/**
 * The config maps and the secrets of the project, which its backend services and FRONTEND microfrontends
 * attach (configMapIds, secretIds). A save stays in the console: with GitOps on, the maps reach the
 * project's repository when an environment is deployed. Secrets are read with their values masked, and creating or
 * editing one stays in the console: its input is a secret, as for storages and databases.
 */
export const variableMapTools = [
    defineTool({
        name: "config_maps_list",
        title: "List config maps",
        description: "The config maps of the project: named sets of keys with a value per environment, which services and FRONTEND microfrontends get as environment variables.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => configMaps(principal).getByProjectId(projectId)
    }),
    defineTool({
        name: "config_map_get",
        title: "Get config map",
        description: "One config map of the project with its keys and their value in each environment.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ configMapId }),
        run: (args, { principal }) => configMaps(principal).getById(args.configMapId)
    }),
    defineTool({
        name: "config_map_create",
        title: "Create config map",
        description:
            "Adds a config map to the project. Its values are readable by anyone who sees the project: put secrets in a secret, from the console. Attach it with service_update or microfrontend_update (configMapIds).",
        scope: MCP_SCOPE_WRITE,
        annotations: WRITE,
        inputSchema: z.object({
            name: z.string().regex(VARIABLE_MAP_NAME, "at most 63 lowercase letters, digits or dashes, starting and ending with a letter or digit"),
            description: z.string().max(2000).optional(),
            entries: entries.optional()
        }),
        run: (args, { principal, projectId }) => configMaps(principal).create(args as VariableMapDTO, projectId)
    }),
    defineTool({
        name: "config_map_update",
        title: "Update config map",
        description: "Renames a config map or changes its description or its keys (replaced as a whole: read it first with config_map_get to keep the others).",
        scope: MCP_SCOPE_WRITE,
        annotations: { ...WRITE, idempotentHint: true },
        inputSchema: z.object({
            configMapId,
            name: z.string().regex(VARIABLE_MAP_NAME, "at most 63 lowercase letters, digits or dashes, starting and ending with a letter or digit").optional(),
            description: z.string().max(2000).optional(),
            entries: entries.optional()
        }),
        run: ({ configMapId: id, ...changes }, { principal }) => configMaps(principal).update(id, changes)
    }),
    defineTool({
        name: "config_map_delete",
        title: "Delete config map",
        description: "Deletes a config map of the project. Refused while a service or a FRONTEND microfrontend still attaches it.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ configMapId }),
        run: async (args, { principal }) => {
            await configMaps(principal).delete(args.configMapId)
            return { deleted: true }
        }
    }),
    defineTool({
        name: "secrets_list",
        title: "List secrets",
        description: "The secrets of the project with their keys and the environments each has a value in. Values are masked; creating or editing a secret is only possible from the console.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: NO_INPUT,
        run: (_args, { principal, projectId }) => secrets(principal).getByProjectId(projectId)
    }),
    defineTool({
        name: "secret_get",
        title: "Get secret",
        description: "One secret of the project with its keys. Values are masked.",
        scope: MCP_SCOPE_READ,
        annotations: READ_ONLY,
        inputSchema: z.object({ secretId }),
        run: (args, { principal }) => secrets(principal).getById(args.secretId)
    }),
    defineTool({
        name: "secret_delete",
        title: "Delete secret",
        description: "Deletes a secret of the project with its values. Refused while a service or a FRONTEND microfrontend still attaches it.",
        scope: MCP_SCOPE_WRITE,
        annotations: DESTRUCTIVE,
        inputSchema: z.object({ secretId }),
        run: async (args, { principal }) => {
            await secrets(principal).delete(args.secretId)
            return { deleted: true }
        }
    })
]
