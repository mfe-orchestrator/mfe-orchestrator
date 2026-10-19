import { IAiChangeRequest } from "../../models/AiChangeRequestModel"
import Microfrontend, { ICodeRepositoryMicrofrontend, IMicrofrontend } from "../../models/MicrofrontendModel"
import Service, { IService, IServiceEnvVariable } from "../../models/ServiceModel"
import { ServiceRuntime } from "../../types/ServiceStack"
import { toObjectId } from "../../utils/mongooseUtils"
import { microfrontendWorkspacePath, serviceWorkspacePath, WorkspaceOwner } from "../../utils/workspacePaths"

/**
 * What the workspace and the AI agent need of something backed by a repository: a microfrontend or
 * a backend service. Its id is the document's: ObjectIds are unique across collections, so the id
 * alone names the component, the kind tells which collection it lives in.
 */
export type RepositoryComponentKind = "microfrontend" | "service"

export interface RepositoryComponentRef {
    kind: RepositoryComponentKind
    id: string
}

interface RepositoryComponentBase {
    _id: IMicrofrontend["_id"]
    projectId: IMicrofrontend["projectId"]
    slug: string
    name: string
    codeRepository?: ICodeRepositoryMicrofrontend
    /** Markdown for AI agents about this component only. */
    context?: string
    /** The functional domain it belongs to, if any. */
    domainId?: IMicrofrontend["domainId"]
}

export interface MicrofrontendComponent extends RepositoryComponentBase {
    kind: "microfrontend"
    framework?: string
    compiler?: string
}

export interface ServiceComponent extends RepositoryComponentBase {
    kind: "service"
    runtime?: ServiceRuntime
    framework?: string
    port?: number
    livenessPath?: string
    readinessPath?: string
    docsPath?: string
    openApiPath?: string
    env: IServiceEnvVariable[]
}

export type RepositoryComponent = MicrofrontendComponent | ServiceComponent

export const fromMicrofrontend = (microfrontend: IMicrofrontend): MicrofrontendComponent => ({
    kind: "microfrontend",
    _id: microfrontend._id,
    projectId: microfrontend.projectId,
    slug: microfrontend.slug,
    name: microfrontend.name,
    codeRepository: microfrontend.codeRepository,
    context: microfrontend.context,
    domainId: microfrontend.domainId ?? undefined,
    framework: microfrontend.stack?.framework,
    compiler: microfrontend.stack?.compiler
})

export const fromService = (service: IService): ServiceComponent => ({
    kind: "service",
    _id: service._id as unknown as IMicrofrontend["_id"],
    projectId: service.projectId,
    slug: service.slug,
    name: service.name,
    codeRepository: service.codeRepository,
    context: service.context,
    domainId: service.domainId ?? undefined,
    runtime: service.stack?.runtime,
    framework: service.stack?.framework,
    port: service.port,
    livenessPath: service.livenessPath,
    readinessPath: service.readinessPath,
    docsPath: service.docsPath ?? undefined,
    openApiPath: service.openApiPath ?? undefined,
    env: service.env ?? []
})

/** The component a request changes. */
export const componentOf = (request: Pick<IAiChangeRequest, "microfrontendId" | "serviceId">): RepositoryComponentRef =>
    request.serviceId ? { kind: "service", id: String(request.serviceId) } : { kind: "microfrontend", id: String(request.microfrontendId) }

/** The id of the component a request changes, whichever its kind. */
export const componentIdOf = (request: Pick<IAiChangeRequest, "microfrontendId" | "serviceId">) => String(request.serviceId ?? request.microfrontendId)

/** The field of a request that names its component. */
export const ownerFields = (component: Pick<RepositoryComponent, "kind" | "_id">) => (component.kind === "service" ? { serviceId: component._id } : { microfrontendId: component._id })

/** The components of a job in the order they are shown: its microfrontends, then its services. */
export const componentsOfJob = (job: { microfrontendIds: unknown[]; serviceIds?: unknown[] }): RepositoryComponentRef[] => [
    ...job.microfrontendIds.map(id => ({ kind: "microfrontend" as const, id: String(id) })),
    ...(job.serviceIds ?? []).map(id => ({ kind: "service" as const, id: String(id) }))
]

/** One component, or null when it no longer exists. Authorization is up to the caller. */
export const findComponent = async (ref: RepositoryComponentRef): Promise<RepositoryComponent | null> => {
    if (ref.kind === "service") {
        const service = await Service.findById(ref.id)
        return service ? fromService(service) : null
    }
    const microfrontend = await Microfrontend.findById(ref.id)
    return microfrontend ? fromMicrofrontend(microfrontend) : null
}

/** Several components, in the order of `refs`; those that no longer exist are left out. Authorization is up to the caller. */
export const findComponents = async (refs: RepositoryComponentRef[], projection?: Record<string, 0 | 1>): Promise<RepositoryComponent[]> => {
    const idsOf = (kind: RepositoryComponentKind) => refs.filter(ref => ref.kind === kind).map(ref => toObjectId(ref.id))
    const microfrontendIds = idsOf("microfrontend")
    const serviceIds = idsOf("service")
    // A kind the job does not use is not queried at all.
    const [microfrontends, services] = await Promise.all([
        microfrontendIds.length ? Microfrontend.find({ _id: { $in: microfrontendIds } }, projection) : [],
        serviceIds.length ? Service.find({ _id: { $in: serviceIds } }, projection) : []
    ])
    const found: RepositoryComponent[] = [...microfrontends.map(fromMicrofrontend), ...services.map(fromService)]
    return refs.flatMap(ref => found.filter(component => component.kind === ref.kind && String(component._id) === ref.id))
}

/** Where the working copy of a component lives: a microfrontend and a service of the same slug never share it. */
export const componentWorkspacePath = (root: string, owner: Pick<WorkspaceOwner, "organization" | "project">, component: Pick<RepositoryComponent, "kind" | "slug">) =>
    component.kind === "service" ? serviceWorkspacePath(root, { ...owner, serviceSlug: component.slug }) : microfrontendWorkspacePath(root, { ...owner, microfrontendSlug: component.slug })
