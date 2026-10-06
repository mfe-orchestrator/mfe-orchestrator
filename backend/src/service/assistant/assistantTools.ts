import Anthropic from "@anthropic-ai/sdk"
import { IUser } from "../../models/UserModel"
import BuildStatusService from "../BuildStatusService"
import DeploymentService from "../DeploymentService"
import EnvironmentService from "../EnvironmentService"
import GlobalVariablesService from "../GlobalVariablesService"
import MarketService from "../MarketService"
import MicrofrontendDependencyService from "../MicrofrontendDependencyService"
import MicrofrontendService from "../MicrofrontendService"
import { searchDocs } from "./docsSearch"

/**
 * What every tool runs against: the user asking and the project open in the console.
 *
 * The project comes from the request, never from the model, and every service call below
 * goes through the same access checks as the REST endpoints. The assistant can therefore
 * only ever read what the user could already open on screen.
 */
export interface AssistantToolContext {
    user: IUser
    projectId: string
}

/** Logs are read from the end: that is where a failing step prints why it failed. */
const MAX_LOG_CHARS_PER_JOB = 15_000
/** All the logs of one tool call together: the result is sent again on every later round. */
const MAX_LOG_CHARS_TOTAL = 40_000
const MAX_DOCS_SECTION_CHARS = 3_000
const DEFAULT_DEPLOYMENTS = 5
const MAX_DEPLOYMENTS = 20

/**
 * CI providers mask the secrets they know about, not tokens a script echoes on its own.
 * Logs are the one tool result made of free text from builds, so the usual credential
 * shapes are blanked before they are sent to the model.
 */
const SECRET_PATTERNS: RegExp[] = [
    /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
    /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
    /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
    /\bnpm_[A-Za-z0-9]{36}\b/g,
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g
]
/** `password=…`, `_authToken: …` and the like: the key stays, so the log still reads. */
const SECRET_ASSIGNMENT = /(_authToken|_auth|password|secret|token|api[_-]?key)(["']?\s*[:=]\s*["']?)[^\s"']{6,}/gi
const URL_CREDENTIALS = /(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g

export const redactSecrets = (value: string): string =>
    SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, "[REDACTED]"), value)
        .replace(URL_CREDENTIALS, "$1[REDACTED]@")
        .replace(SECRET_ASSIGNMENT, "$1$2[REDACTED]")

const tail = (value: string, max: number) => (value.length > max ? { text: value.slice(-max), truncated: true } : { text: value, truncated: false })

const readString = (input: Record<string, unknown>, key: string): string => {
    const value = input[key]
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`"${key}" must be a non-empty string`)
    }
    return value.trim()
}

const readOptionalNumber = (input: Record<string, unknown>, key: string): number | undefined => {
    const value = input[key]
    if (value === undefined || value === null) return undefined
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`"${key}" must be a number`)
    }
    return value
}

interface AssistantTool {
    definition: Anthropic.Beta.BetaTool
    run: (input: Record<string, unknown>, context: AssistantToolContext) => Promise<unknown>
}

const noInput: Anthropic.Beta.BetaTool.InputSchema = { type: "object", properties: {}, additionalProperties: false }

const tools: AssistantTool[] = [
    {
        definition: {
            name: "list_microfrontends",
            description:
                "Lists the microfrontends of the current project with their id, slug, selected version, type, framework, how they are hosted, canary settings and parent microfrontends. Use it to resolve a name the user mentions into an id.",
            input_schema: noInput
        },
        run: async (_input, { user, projectId }) => {
            const microfrontends = await new MicrofrontendService(user).getByProjectId(projectId)
            return microfrontends.map(microfrontend => ({
                id: microfrontend._id.toString(),
                name: microfrontend.name,
                slug: microfrontend.slug,
                version: microfrontend.version,
                type: microfrontend.type,
                framework: microfrontend.stack?.framework,
                compiler: microfrontend.stack?.compiler,
                hostedOn: microfrontend.host?.type,
                continuousDeployment: microfrontend.continuousDeployment,
                canary: microfrontend.canary?.enabled ? { percentage: microfrontend.canary.percentage, type: microfrontend.canary.type, version: microfrontend.canary.version } : undefined,
                hasCodeRepository: Boolean(microfrontend.codeRepository?.enabled),
                parentIds: microfrontend.parentIds?.map(id => id.toString()),
                description: microfrontend.description
            }))
        }
    },
    {
        definition: {
            name: "list_environments",
            description: "Lists the environments of the current project (id, name, slug, whether it is production, domains), in their configured order.",
            input_schema: noInput
        },
        run: async (_input, { user, projectId }) => {
            const environments = await new EnvironmentService(user).getByProjectId(projectId)
            return environments.map(environment => ({
                id: environment._id.toString(),
                name: environment.name,
                slug: environment.slug,
                isProduction: environment.isProduction,
                domains: environment.domains
            }))
        }
    },
    {
        definition: {
            name: "get_build_status",
            description:
                "Returns the CI status of every microfrontend of the project: the latest runs (id, status, ref, commit, start/end time, link), the latest version that reached the platform and the version each environment currently serves.",
            input_schema: noInput
        },
        run: async (_input, { user, projectId }) => new BuildStatusService(user).getByProjectId(projectId)
    },
    {
        definition: {
            name: "get_failed_build_logs",
            description: `Downloads the logs of the failed jobs of one CI run of a microfrontend. Each log is cut to its last ${MAX_LOG_CHARS_PER_JOB} characters, where the error usually is; "truncated" says when that happened. Get run ids from get_build_status.`,
            input_schema: {
                type: "object",
                properties: {
                    microfrontend_id: { type: "string", description: "Id of the microfrontend, as returned by list_microfrontends or get_build_status." },
                    run_id: { type: "string", description: "Id of the CI run, as returned by get_build_status." }
                },
                required: ["microfrontend_id", "run_id"],
                additionalProperties: false
            }
        },
        run: async (input, { user, projectId }) => {
            const logs = await new BuildStatusService(user).getFailedRunLogs(projectId, readString(input, "microfrontend_id"), readString(input, "run_id"))
            let budget = MAX_LOG_CHARS_TOTAL
            return logs.map(job => {
                const { text, truncated } = tail(redactSecrets(job.log), Math.min(MAX_LOG_CHARS_PER_JOB, budget))
                budget = Math.max(budget - text.length, 0)
                return { job: job.name, truncated, log: text }
            })
        }
    },
    {
        definition: {
            name: "list_deployments",
            description: `Lists the most recent deployments of an environment, newest first: when they happened, whether they are the active one, the version of every microfrontend they shipped and the keys of the variables they carried. Defaults to ${DEFAULT_DEPLOYMENTS}, at most ${MAX_DEPLOYMENTS}.`,
            input_schema: {
                type: "object",
                properties: {
                    environment_id: { type: "string", description: "Id of the environment, as returned by list_environments." },
                    limit: { type: "integer", description: `How many deployments to return (1-${MAX_DEPLOYMENTS}).` }
                },
                required: ["environment_id"],
                additionalProperties: false
            }
        },
        run: async (input, { user, projectId }) => {
            const limit = Math.min(Math.max(Math.trunc(readOptionalNumber(input, "limit") ?? DEFAULT_DEPLOYMENTS), 1), MAX_DEPLOYMENTS)
            const environmentId = readString(input, "environment_id")
            // The id comes from the model: an environment of another project, even one the user can
            // open, is not what this conversation is about.
            const environment = await new EnvironmentService(user).getById(environmentId)
            if (!environment || environment.projectId.toString() !== projectId) {
                throw new Error("Environment not found in this project")
            }
            const deployments = await new DeploymentService(user).getByEnvironmentId(environmentId)
            // Storages are left out on purpose: a deployment freezes a copy of them, bucket
            // credentials included, and nothing the assistant answers needs them.
            return deployments.slice(0, limit).map(deployment => ({
                id: deployment._id.toString(),
                deploymentId: deployment.deploymentId,
                active: deployment.active,
                deployedAt: deployment.deployedAt,
                microfrontends: (deployment.microfrontends || []).map(microfrontend => ({
                    id: microfrontend._id?.toString(),
                    name: microfrontend.name,
                    slug: microfrontend.slug,
                    version: microfrontend.version,
                    canary: microfrontend.canary?.enabled ? { percentage: microfrontend.canary.percentage, version: microfrontend.canary.version } : undefined
                })),
                variableKeys: (deployment.variables || []).map(variable => variable.key)
            }))
        }
    },
    {
        definition: {
            name: "get_environment_variables",
            description: "Lists the keys of the environment variables of the project and, for each key, the environments it is defined in. Values are never returned.",
            input_schema: noInput
        },
        run: async (_input, { user, projectId }) => {
            const [variables, environments] = await Promise.all([new GlobalVariablesService(user).getAllByProjectId(projectId), new EnvironmentService(user).getByProjectId(projectId)])
            const environmentNames = new Map(environments.map(environment => [environment._id.toString(), environment.name]))
            const byKey = new Map<string, string[]>()
            for (const variable of variables) {
                const names = byKey.get(variable.key) || []
                names.push(environmentNames.get(variable.environmentId.toString()) || variable.environmentId.toString())
                byKey.set(variable.key, names)
            }
            return {
                environments: environments.map(environment => environment.name),
                variables: [...byKey.entries()].map(([key, definedIn]) => ({ key, definedIn }))
            }
        }
    },
    {
        definition: {
            name: "get_dependency_report",
            description:
                "Scans the package.json of every microfrontend and returns the packages whose version ranges disagree across microfrontends (peer and shared dependencies) with the suggested range, plus the microfrontends whose package.json could not be read. Slow: call it once per question.",
            input_schema: noInput
        },
        run: async (_input, { user, projectId }) => {
            const report = await new MicrofrontendDependencyService(user).getReport(projectId)
            return {
                scannedAt: report.scannedAt,
                registryAvailable: report.registryAvailable,
                peerDependencyIssues: report.peerDependencyIssues,
                sharedDependencyIssues: report.sharedDependencyIssues,
                microfrontends: report.microfrontends.map(microfrontend => ({
                    name: microfrontend.name,
                    branch: microfrontend.branch,
                    dependencyCount: microfrontend.dependencies.length,
                    error: microfrontend.error
                }))
            }
        }
    },
    {
        definition: {
            name: "search_docs",
            description:
                "Searches the MFE Orchestrator documentation (written in English) and returns the best matching sections with their URL. Use it for any how-to or concept question, and cite the URL of the sections you relied on.",
            input_schema: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Keywords in English, e.g. 'canary release percentage' or 'connect S3 bucket'." }
                },
                required: ["query"],
                additionalProperties: false
            }
        },
        run: async input =>
            searchDocs(readString(input, "query")).map(section => ({
                title: section.title,
                url: section.url,
                text: section.text.length > MAX_DOCS_SECTION_CHARS ? `${section.text.slice(0, MAX_DOCS_SECTION_CHARS)}…` : section.text
            }))
    },
    {
        definition: {
            name: "list_templates",
            description: "Lists the microfrontend templates of the templates library (slug, name, framework, compiler, type, description, whether they are coming soon).",
            input_schema: noInput
        },
        run: async () => {
            const templates = await new MarketService().getAll()
            return templates.map(template => ({
                slug: template.slug,
                name: template.name,
                framework: template.framework,
                compiler: template.compiler,
                type: template.type,
                description: template.description,
                comingSoon: template.comingSoon
            }))
        }
    }
]

const toolsByName = new Map(tools.map(tool => [tool.definition.name, tool]))

export const assistantToolDefinitions: Anthropic.Beta.BetaTool[] = tools.map(tool => tool.definition)

/**
 * Runs one tool call and turns whatever happens into a tool_result.
 *
 * Failures go back to the model as `is_error` results instead of aborting the turn: an
 * access error or an unreachable CI provider is something it can explain to the user.
 */
export const runAssistantTool = async (block: Anthropic.Beta.BetaToolUseBlock, context: AssistantToolContext): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
    const tool = toolsByName.get(block.name)
    if (!tool) {
        return { type: "tool_result", tool_use_id: block.id, is_error: true, content: `Unknown tool "${block.name}"` }
    }
    try {
        const input = block.input && typeof block.input === "object" ? (block.input as Record<string, unknown>) : {}
        const result = await tool.run(input, context)
        return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result ?? null) }
    } catch (error) {
        return { type: "tool_result", tool_use_id: block.id, is_error: true, content: error instanceof Error ? error.message : String(error) }
    }
}
