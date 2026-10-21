import Microfrontend, { ICodeRepositoryMicrofrontend, IMicrofrontend } from "../../models/MicrofrontendModel"
import { toObjectId } from "../../utils/mongooseUtils"

/** What the workspace and the AI agent need of a microfrontend backed by a repository. */
export interface RepositoryComponent {
    _id: IMicrofrontend["_id"]
    projectId: IMicrofrontend["projectId"]
    slug: string
    name: string
    codeRepository?: ICodeRepositoryMicrofrontend
    /** Markdown for AI agents about this microfrontend only. */
    context?: string
    framework?: string
    compiler?: string
}

export const fromMicrofrontend = (microfrontend: IMicrofrontend): RepositoryComponent => ({
    _id: microfrontend._id,
    projectId: microfrontend.projectId,
    slug: microfrontend.slug,
    name: microfrontend.name,
    codeRepository: microfrontend.codeRepository,
    context: microfrontend.context,
    framework: microfrontend.stack?.framework,
    compiler: microfrontend.stack?.compiler
})

/** One microfrontend, or null when it no longer exists. Authorization is up to the caller. */
export const findComponent = async (id: string): Promise<RepositoryComponent | null> => {
    const microfrontend = await Microfrontend.findById(id)
    return microfrontend ? fromMicrofrontend(microfrontend) : null
}

/** Several microfrontends, in the order of `ids`; those that no longer exist are left out. Authorization is up to the caller. */
export const findComponents = async (ids: string[], projection?: Record<string, 0 | 1>): Promise<RepositoryComponent[]> => {
    if (ids.length === 0) return []
    const found = (await Microfrontend.find({ _id: { $in: ids.map(id => toObjectId(id)) } }, projection)).map(fromMicrofrontend)
    return ids.flatMap(id => found.filter(component => String(component._id) === id))
}
