import fs from "node:fs/promises"
import { fastify } from "../.."
import AiChangeRequest from "../../models/AiChangeRequestModel"
import { IMicrofrontend } from "../../models/MicrofrontendModel"
import Organization from "../../models/OrganizationModel"
import Project, { IProject } from "../../models/ProjectModel"
import { IService } from "../../models/ServiceModel"
import { toObjectId } from "../../utils/mongooseUtils"
import { projectWorkspacePath } from "../../utils/workspacePaths"
import { componentWorkspacePath, fromMicrofrontend, fromService, RepositoryComponent } from "./repositoryComponent"

/**
 * What goes away with a microfrontend, a service or a project besides its documents: the local clones of its
 * repositories and the AI change requests made on them.
 *
 * Kept apart from the workspace service so the services that delete things can call it without
 * importing the repository clients. Never throws: a leftover folder is harmless and eviction
 * removes it eventually, while a failure here must not undo a deletion the user asked for.
 */
const ownerOf = async (project: IProject | null) => {
    const organization = project && (await Organization.findById(project.organizationId, { slug: 1 }))
    if (!project || !organization) return undefined
    return { organization: { slug: organization.slug, id: organization._id.toString() }, project: { slug: project.slug, id: project._id.toString() } }
}

const removeFolder = async (folder: string) => {
    await fs.rm(folder, { recursive: true, force: true })
}

const forgetComponents = async (components: RepositoryComponent[]) => {
    try {
        for (const component of components) {
            const owner = await ownerOf(await Project.findById(component.projectId))
            if (owner) await removeFolder(componentWorkspacePath(fastify.config.REPOSITORIES_FOLDER, owner, component))
        }
        const idsOf = (kind: RepositoryComponent["kind"]) => components.filter(component => component.kind === kind).map(component => component._id)
        await AiChangeRequest.deleteMany({ $or: [{ microfrontendId: { $in: idsOf("microfrontend") } }, { serviceId: { $in: idsOf("service") } }] })
    } catch (error) {
        fastify.log.warn({ err: error }, "Could not clean up after deleted components")
    }
}

export const forgetMicrofrontends = (microfrontends: IMicrofrontend[]) => forgetComponents(microfrontends.map(fromMicrofrontend))

export const forgetServices = (services: IService[]) => forgetComponents(services.map(fromService))

/** Resolves the folder before the project is deleted, removes it once the deletion went through. */
export const prepareProjectCleanup = async (projectId: string) => {
    const owner = await ownerOf(await Project.findById(projectId)).catch(() => undefined)
    return async () => {
        try {
            if (owner) await removeFolder(projectWorkspacePath(fastify.config.REPOSITORIES_FOLDER, owner))
            await AiChangeRequest.deleteMany({ projectId: toObjectId(projectId) })
        } catch (error) {
            fastify.log.warn({ err: error, projectId }, "Could not clean up after a deleted project")
        }
    }
}
