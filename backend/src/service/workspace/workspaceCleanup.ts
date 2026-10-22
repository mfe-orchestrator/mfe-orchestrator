import fs from "node:fs/promises"
import { fastify } from "../.."
import AiChangeRequest from "../../models/AiChangeRequestModel"
import { IMicrofrontend } from "../../models/MicrofrontendModel"
import Organization from "../../models/OrganizationModel"
import Project, { IProject } from "../../models/ProjectModel"
import { toObjectId } from "../../utils/mongooseUtils"
import { microfrontendWorkspacePath, projectWorkspacePath } from "../../utils/workspacePaths"

/**
 * What goes away with a microfrontend or a project besides its documents: the local clones of its
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

export const forgetMicrofrontends = async (microfrontends: IMicrofrontend[]) => {
    try {
        for (const microfrontend of microfrontends) {
            const owner = await ownerOf(await Project.findById(microfrontend.projectId))
            if (owner) await removeFolder(microfrontendWorkspacePath(fastify.config.REPOSITORIES_FOLDER, { ...owner, microfrontendSlug: microfrontend.slug }))
        }
        await AiChangeRequest.deleteMany({ microfrontendId: { $in: microfrontends.map(microfrontend => microfrontend._id) } })
    } catch (error) {
        fastify.log.warn({ err: error }, "Could not clean up after deleted microfrontends")
    }
}

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
