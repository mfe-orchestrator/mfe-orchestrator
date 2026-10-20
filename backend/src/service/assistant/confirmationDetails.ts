import { fastify } from "../.."
import { McpToolContext, McpToolDefinition } from "../../mcp/toolDefinition"
import { AiChangeStatus } from "../../models/AiChangeRequestModel"
import { IDeployment } from "../../models/DeploymentModel"
import { IMicrofrontend } from "../../models/MicrofrontendModel"
import { ApiKeyService } from "../ApiKeyService"
import AiChangeJobService from "../aiChange/AiChangeJobService"
import AiChangeService from "../aiChange/AiChangeService"
import CodeRepositoryService from "../CodeRepositoryService"
import DeploymentService from "../DeploymentService"
import DomainService from "../DomainService"
import EnvironmentService from "../EnvironmentService"
import GlobalVariablesService from "../GlobalVariablesService"
import MicrofrontendService from "../MicrofrontendService"
import OAuthGrantService from "../OAuthGrantService"
import OrganizationService from "../OrganizationService"
import ProjectService from "../ProjectService"
import ServiceService from "../ServiceService"
import { StorageService } from "../StorageService"
import UserOrganizationService from "../UserOrganizationService"
import UserProjectService from "../UserProjectService"

/**
 * One line of a confirmation card. `label` is a stable key the console translates (an input field's
 * name when nothing better is known); `value` is what the user checks before saying yes.
 */
export interface ConfirmationDetail {
    label: string
    value: string
}

const MAX_VALUE_CHARS = 200
const MAX_LINES = 50

const clip = (value: string, max = MAX_VALUE_CHARS) => (value.length > max ? `${value.slice(0, max)}…` : value)

const lines = (values: string[]) => (values.length > MAX_LINES ? [...values.slice(0, MAX_LINES), `… +${values.length - MAX_LINES}`] : values).join("\n")

/** The input as the model sent it, readable: what the card falls back to when a name cannot be found. */
const rawValue = (value: unknown): string => {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) return clip(String(value))
    if (Array.isArray(value) && value.every(item => ["string", "number", "boolean"].includes(typeof item))) return clip(value.join(", "), 1_000)
    return clip(JSON.stringify(value), 1_000)
}

const once = <T>(load: () => Promise<T>) => {
    let loaded: Promise<T> | undefined
    return () => (loaded ??= load())
}

type ServedMicrofrontend = Pick<IMicrofrontend, "slug" | "name" | "version"> & { host?: { type?: string; url?: string } }
interface Served {
    microfrontends: ServedMicrofrontend[]
    variables: { key: string; value: string }[]
}

const hostOf = (microfrontend: ServedMicrofrontend) => microfrontend.host?.url || microfrontend.host?.type || "?"
const describeMicrofrontend = (microfrontend: ServedMicrofrontend) => `${microfrontend.name ?? microfrontend.slug} ${microfrontend.version ?? "?"} (${hostOf(microfrontend)})`
const servedOf = (deployment: Pick<IDeployment, "microfrontends" | "variables">): Served => ({
    microfrontends: (deployment.microfrontends ?? []) as ServedMicrofrontend[],
    variables: (deployment.variables ?? []).map(variable => ({ key: variable.key, value: variable.value }))
})

/** What `next` serves that `current` does not: microfrontends added, removed or moved to another version or host, and variables. */
export const describeServedChanges = (current: Served, next: Served): string[] => {
    const changes: string[] = []
    const keyOf = (microfrontend: ServedMicrofrontend) => microfrontend.slug ?? microfrontend.name
    const before = new Map(current.microfrontends.map(microfrontend => [keyOf(microfrontend), microfrontend]))
    const after = new Map(next.microfrontends.map(microfrontend => [keyOf(microfrontend), microfrontend]))
    for (const [key, microfrontend] of after) {
        const previous = before.get(key)
        const name = microfrontend.name ?? key
        if (!previous) {
            changes.push(`+ ${describeMicrofrontend(microfrontend)}`)
            continue
        }
        if (previous.version !== microfrontend.version) changes.push(`${name}: ${previous.version} → ${microfrontend.version}`)
        if (hostOf(previous) !== hostOf(microfrontend)) changes.push(`${name}: ${hostOf(previous)} → ${hostOf(microfrontend)}`)
    }
    for (const [key, microfrontend] of before) {
        if (!after.has(key)) changes.push(`− ${microfrontend.name ?? key}`)
    }

    const valuesBefore = new Map(current.variables.map(variable => [variable.key, variable.value]))
    const valuesAfter = new Map(next.variables.map(variable => [variable.key, variable.value]))
    for (const [key, value] of valuesAfter) {
        if (!valuesBefore.has(key)) changes.push(`+ ${key} = ${clip(value, 100)}`)
        else if (valuesBefore.get(key) !== value) changes.push(`${key}: ${clip(valuesBefore.get(key) ?? "", 100)} → ${clip(value, 100)}`)
    }
    for (const key of valuesBefore.keys()) {
        if (!valuesAfter.has(key)) changes.push(`− ${key}`)
    }
    return changes
}

const describeServed = (served: Served) => [...served.microfrontends.map(describeMicrofrontend), ...served.variables.map(variable => `${variable.key} = ${clip(variable.value, 100)}`)]

const formatDate = (value: Date | string | undefined) => (value ? new Date(value).toISOString().slice(0, 16).replace("T", " ") : "")

/** The lookups of one card, each done at most once and always with the user's own access. */
class DetailResolver {
    private readonly principal: McpToolContext["principal"]
    private readonly projectId: string

    constructor(
        private readonly tool: McpToolDefinition,
        private readonly args: Record<string, unknown>,
        context: McpToolContext
    ) {
        this.principal = context.principal
        this.projectId = context.projectId
    }

    private readonly environments = once(() => new EnvironmentService(this.principal).getByProjectId(this.projectId))
    private readonly microfrontends = once(() => new MicrofrontendService(this.principal).getByProjectId(this.projectId))

    private async environmentName(id: string) {
        return (await this.environments()).find(environment => String(environment._id) === id)?.name
    }

    private async microfrontendLabel(id: string) {
        const microfrontend = (await this.microfrontends()).find(candidate => String(candidate._id) === id)
        return microfrontend && describeMicrofrontend(microfrontend)
    }

    private async userLabel(id: string) {
        const organizationId = this.tool.projectScoped === false ? String(this.args.organizationId ?? "") : undefined
        const users = organizationId
            ? await new UserOrganizationService(this.principal).getOrganizationUsers(organizationId)
            : await new UserProjectService(this.principal).getProjectUsers(this.projectId)
        const user = users?.find(candidate => String(candidate._id) === id)
        if (!user) return undefined
        const name = [user.name, user.surname].filter(Boolean).join(" ")
        return name ? `${name} <${user.email}>` : user.email
    }

    private async deploymentLabel(id: string) {
        const deployment = await new DeploymentService(this.principal).getById(id)
        if (!deployment) return undefined
        // The id alone is not checked against the project: reading the environment is.
        const environment = await new EnvironmentService(this.principal).getById(deployment.environmentId)
        if (!environment) return undefined
        return `${environment.name} ${deployment.deploymentId} (${formatDate(deployment.deployedAt)})`
    }

    /** Names for the ids of one input field; anything else, or a name that cannot be found, as sent. */
    private async resolveField(key: string, value: unknown): Promise<ConfirmationDetail[]> {
        const ids = (Array.isArray(value) ? value : [value]).map(String)
        const each = async (label: string, name: (id: string) => Promise<string | undefined>): Promise<ConfirmationDetail[]> => {
            const names = await Promise.all(ids.map(async id => (await name(id).catch(() => undefined)) ?? id))
            return [{ label, value: lines(names) }]
        }
        switch (key) {
            case "environmentId":
            case "environmentIds":
                return each(key === "environmentId" ? "environment" : "environments", id => this.environmentName(id))
            case "microfrontendId":
            case "microfrontendIds":
                return each(key === "microfrontendId" ? "microfrontend" : "microfrontends", id => this.microfrontendLabel(id))
            case "hostId":
                return each("host", id => this.microfrontendLabel(id))
            case "remoteId":
                return each("remote", id => this.microfrontendLabel(id))
            case "userId":
                return each("user", id => this.userLabel(id))
            case "organizationId":
                return each("organization", async id => (await new OrganizationService(this.principal).findById(id))?.name)
            case "deploymentId":
                return each("deployment", id => this.deploymentLabel(id))
            case "apiKeyId":
                return each("api_key", async id => {
                    const apiKey = (await new ApiKeyService(this.principal).getByProjectId(this.projectId)).find(candidate => String(candidate._id) === id)
                    return apiKey && `${apiKey.name} (${apiKey.role})`
                })
            case "grantId":
                return each("mcp_client", async id => {
                    const grant = (await new OAuthGrantService(this.principal).listForProject(this.projectId)).find(candidate => candidate.id === id)
                    return grant && `${grant.clientName} (${grant.userEmail})`
                })
            case "serviceId":
                return each("service", async id => (await new ServiceService(this.principal).getById(id))?.name)
            case "domainId":
                return each("domain", async id => (await new DomainService(this.principal).getById(id))?.name)
            case "storageId":
                return each("storage", async id => (await new StorageService(this.principal).getByProjectId(this.projectId)).find(storage => String(storage._id) === id)?.name)
            case "codeRepositoryId":
                return each("code_repository", async id => (await new CodeRepositoryService(this.principal).findById(id))?.name)
            case "changeId":
                return this.aiChange(String(value))
            case "jobId":
                return this.aiJob(String(value))
            default:
                return [{ label: key, value: rawValue(value) }]
        }
    }

    /** An AI change: on which microfrontend, what was asked, and the files it would write. */
    private async aiChange(id: string): Promise<ConfirmationDetail[]> {
        const change = await new AiChangeService(this.principal, fastify.config).get(id).catch(() => undefined)
        if (!change) return [{ label: "ai_change", value: id }]
        const files = (change.files ?? []).map(file => `${file.action} ${file.path}`)
        const microfrontend = change.microfrontendId ? await this.microfrontendLabel(String(change.microfrontendId)).catch(() => undefined) : undefined
        const service = change.serviceId ? await new ServiceService(this.principal).getById(String(change.serviceId)).catch(() => undefined) : undefined
        return [
            change.serviceId ? { label: "service", value: service?.name ?? String(change.serviceId) } : { label: "microfrontend", value: microfrontend ?? String(change.microfrontendId) },
            { label: "prompt", value: clip(change.prompt ?? "") },
            ...(files.length ? [{ label: "files", value: lines(files) }] : [])
        ]
    }

    /** An AI job: what was asked, and per repository how many files its proposal would commit. */
    private async aiJob(id: string): Promise<ConfirmationDetail[]> {
        const job = await new AiChangeJobService(this.principal, fastify.config).get(id).catch(() => undefined)
        if (!job) return [{ label: "jobId", value: id }]
        const proposed = job.repositories
            .filter(repository => repository.status === AiChangeStatus.PROPOSED && repository.files.length > 0)
            .map(repository => `${repository.microfrontendName || repository.microfrontendSlug}: ${repository.files.length} ${repository.files.length === 1 ? "file" : "files"}`)
        return [{ label: "prompt", value: clip(job.prompt) }, ...(proposed.length ? [{ label: "microfrontends", value: lines(proposed) }] : [])]
    }

    /** Per environment: what the new deployment changes compared to the one served now, or all it serves when there is none. */
    private async deploy(environmentIds: string[]): Promise<ConfirmationDetail[]> {
        const details: ConfirmationDetail[] = []
        for (const environmentId of environmentIds) {
            details.push({ label: "environment", value: (await this.environmentName(environmentId).catch(() => undefined)) ?? environmentId })
            try {
                const deploymentService = new DeploymentService(this.principal)
                const deployments = await deploymentService.getByEnvironmentId(environmentId)
                const current = deployments.find(deployment => deployment.active) ?? deployments[0]
                // A domain-scoped member's deploy keeps the variables served now: the live ones would show a change it does not ship
                const servedVariables = current && (await deploymentService.shipsServedVariables(environmentId))
                const next: Served = {
                    microfrontends: await this.microfrontends(),
                    variables: servedVariables
                        ? servedOf(current).variables
                        : (await new GlobalVariablesService(this.principal).getAll(environmentId)).map(variable => ({ key: variable.key, value: variable.value }))
                }
                details.push(...this.comparison(current, next))
            } catch {
                // The environment's name is already on the card: the comparison is a bonus.
            }
        }
        return details
    }

    /** A rollback: which deployment comes back, and what that changes compared to the one served now. */
    private async rollback(deploymentId: string): Promise<ConfirmationDetail[]> {
        const service = new DeploymentService(this.principal)
        const found = await service.getById(deploymentId)
        if (!found) return [{ label: "deployment", value: deploymentId }]
        const environment = await new EnvironmentService(this.principal).getById(found.environmentId)
        if (!environment) return [{ label: "deployment", value: deploymentId }]
        const deployments = await service.getByEnvironmentId(found.environmentId)
        // The target as the principal may read it: getById answers the whole snapshot, the microfrontends of
        // every domain included, while the list keeps a domain-scoped member's own only
        const target = deployments.find(deployment => String(deployment._id) === String(found._id))
        if (!target) return [{ label: "deployment", value: deploymentId }]
        const current = deployments.find(deployment => deployment.active) ?? deployments[0]
        return [
            { label: "environment", value: environment.name },
            { label: "deployment", value: `${target.deploymentId} (${formatDate(target.deployedAt)})` },
            ...(current && String(current._id) === String(target._id) ? [{ label: "no_changes", value: current.deploymentId }] : this.comparison(current, servedOf(target)))
        ]
    }

    private comparison(current: IDeployment | undefined, next: Served): ConfirmationDetail[] {
        if (!current) return [{ label: "served", value: lines(describeServed(next)) }]
        const changes = describeServedChanges(servedOf(current), next)
        return changes.length ? [{ label: "changes", value: lines(changes) }] : [{ label: "no_changes", value: current.deploymentId }]
    }

    async describe(): Promise<ConfirmationDetail[]> {
        const details: ConfirmationDetail[] = []
        if (this.tool.projectScoped !== false) {
            const project = await new ProjectService(this.principal).findById(this.projectId).catch(() => undefined)
            details.push({ label: "project", value: project?.name ?? this.projectId })
        }
        const ids = (value: unknown) => (Array.isArray(value) ? value.map(String) : [])
        if (this.tool.name === "deploy") return [...details, ...(await this.deploy(ids(this.args.environmentIds)))]
        if (this.tool.name === "deployment_rollback") {
            return [...details, ...(await this.rollback(String(this.args.deploymentId)).catch(() => [{ label: "deployment", value: String(this.args.deploymentId) }]))]
        }
        for (const [key, value] of Object.entries(this.args)) {
            if (value === undefined) continue
            details.push(...(await this.resolveField(key, value).catch(() => [{ label: key, value: rawValue(value) }])))
        }
        return details
    }
}

/**
 * What a confirmation card shows: the ids of the input resolved to names, with the user's own access,
 * and for a deployment what it changes. Best effort: a name that cannot be found is shown as sent,
 * and a lookup that fails never stops the card from being shown.
 */
export const describeConfirmation = async (tool: McpToolDefinition, args: Record<string, unknown>, context: McpToolContext): Promise<ConfirmationDetail[]> => {
    try {
        return await new DetailResolver(tool, args, context).describe()
    } catch {
        return Object.entries(args).flatMap(([label, value]) => (value === undefined ? [] : [{ label, value: rawValue(value) }]))
    }
}
