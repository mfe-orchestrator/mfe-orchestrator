import { FastifyInstance } from "fastify"
import { createWizardProjectSchema, wizardProjectIdSchema } from "../schemas/misc.schema"
import { ProjectCreateInput } from "../service/ProjectService"
import ProjectWizardService from "../service/ProjectWizardService"

export default async function projectStateWizardController(fastify: FastifyInstance) {
    fastify.post<{ Body: ProjectCreateInput }>("/projects/wizard", { schema: createWizardProjectSchema }, async (request, reply) => {
        return reply.send(await new ProjectWizardService().createNew(request.body, request.databaseUser._id))
    })

    fastify.put<{
        Params: {
            projectId: string
        }
    }>("/projects/wizard/:projectId/next", { schema: wizardProjectIdSchema }, async (request, reply) => {
        return reply.send(await new ProjectWizardService().next(request.params.projectId))
    })

    fastify.put<{
        Params: {
            projectId: string
        }
    }>("/projects/wizard/:projectId/prev", { schema: wizardProjectIdSchema }, async (request, reply) => {
        return reply.send(await new ProjectWizardService().prev(request.params.projectId))
    })
}
