import { z } from "zod"
import { defineTool, objectId, READ_ONLY, READ_ONLY_EXTERNAL } from "../../mcp/toolDefinition"
import { MCP_SCOPE_READ } from "../../utils/oauthConfig"
import BuildStatusService, { BuildRunOwner } from "../BuildStatusService"
import { searchDocs } from "./docsSearch"

/** Logs are read from the end: that is where a failing step prints why it failed. */
const MAX_LOG_CHARS_PER_JOB = 15_000
/** All the logs of one tool call together: the result is sent again on every later round. */
const MAX_LOG_CHARS_TOTAL = 40_000
const MAX_DOCS_SECTION_CHARS = 3_000

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
/** Environment variables a script prints: `AWS_SECRET_ACCESS_KEY=…`, `NPM_TOKEN: …`, `DB_PWD=…`. */
const SECRET_VARIABLE = /\b([A-Z_]*(?:SECRET|KEY|TOKEN|PASSWORD|PASSWD|PWD)[A-Z_]*)(\s*[=:]\s*)\S+/g
const BEARER = /\b(Bearer\s+)\S+/gi
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g
/** Azure Storage connection strings and SAS tokens. */
const ACCOUNT_KEY = /\b(AccountKey=)[^;\s]+/gi
const SHARED_ACCESS_SIGNATURE = /\b(SharedAccessSignature=)[^;\s]+/gi
const SAS_SIGNATURE = /([?&]sig=)[^&\s"']+/gi
const URL_CREDENTIALS = /(https?:\/\/)[^/\s:@]+:[^/\s@]+@/g

export const redactSecrets = (value: string): string =>
    SECRET_PATTERNS.reduce((redacted, pattern) => redacted.replace(pattern, "[REDACTED]"), value)
        .replace(PRIVATE_KEY, "[REDACTED PRIVATE KEY]")
        .replace(URL_CREDENTIALS, "$1[REDACTED]@")
        .replace(ACCOUNT_KEY, "$1[REDACTED]")
        .replace(SHARED_ACCESS_SIGNATURE, "$1[REDACTED]")
        .replace(SAS_SIGNATURE, "$1[REDACTED]")
        .replace(BEARER, "$1[REDACTED]")
        .replace(SECRET_VARIABLE, "$1$2[REDACTED]")
        .replace(SECRET_ASSIGNMENT, "$1$2[REDACTED]")

const tail = (value: string, max: number) => (value.length > max ? { text: value.slice(-max), truncated: true } : { text: value, truncated: false })

/**
 * The tools only the assistant has: everything else it can do comes from the MCP tools, run in
 * process. These two have no MCP counterpart (the documentation is the console's own, and build
 * logs are free text a CI job wrote, redacted here before they reach the model).
 */
export const assistantOnlyTools = [
    defineTool({
        name: "get_failed_build_logs",
        title: "Read failed build logs",
        description: `Downloads the logs of the failed jobs of one CI run of a microfrontend (frontend build) or of a service (backend build): pass exactly one of microfrontendId and serviceId. Each log is cut to its last ${MAX_LOG_CHARS_PER_JOB} characters, where the error usually is; "truncated" says when that happened. Get run ids from build_status_get.`,
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY_EXTERNAL,
        inputSchema: z
            .object({
                microfrontendId: objectId("Id of the microfrontend, as returned by microfrontends_list or build_status_get").optional(),
                serviceId: objectId("Id of the service, as returned by services_list or build_status_get").optional(),
                runId: z.string().trim().min(1).describe("Id of the CI run, as returned by build_status_get")
            })
            .refine(args => Boolean(args.microfrontendId) !== Boolean(args.serviceId), { message: "Pass exactly one of microfrontendId and serviceId" }),
        run: async (args, { principal, projectId }) => {
            const owner: BuildRunOwner = args.serviceId ? { serviceId: args.serviceId } : { microfrontendId: args.microfrontendId as string }
            const logs = await new BuildStatusService(principal).getFailedRunLogs(projectId, owner, args.runId)
            let budget = MAX_LOG_CHARS_TOTAL
            return logs.map(job => {
                const { text, truncated } = tail(redactSecrets(job.log), Math.min(MAX_LOG_CHARS_PER_JOB, budget))
                budget = Math.max(budget - text.length, 0)
                return { job: job.name, truncated, log: text }
            })
        }
    }),
    defineTool({
        name: "search_docs",
        title: "Search the documentation",
        description:
            "Searches the MFE Orchestrator documentation (written in English) and returns the best matching sections with their URL. Use it for any how-to or concept question, and cite the URL of the sections you relied on.",
        scope: MCP_SCOPE_READ,
        consoleOnly: true,
        annotations: READ_ONLY,
        inputSchema: z.object({
            query: z.string().trim().min(1).describe("Keywords in English, e.g. 'canary release percentage' or 'connect S3 bucket'")
        }),
        run: async args =>
            searchDocs(args.query).map(section => ({
                title: section.title,
                url: section.url,
                text: section.text.length > MAX_DOCS_SECTION_CHARS ? `${section.text.slice(0, MAX_DOCS_SECTION_CHARS)}…` : section.text
            }))
    })
]
