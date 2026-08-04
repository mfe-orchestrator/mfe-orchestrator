import { FastifyInstance } from "fastify"
import ProjectWizardService, { WizardStartInput } from "../service/ProjectWizardService"

interface ProjectIdParams {
    projectId: string
}

/**
 * The wizard is driven entirely from here: the client never decides which step
 * comes next, it asks the backend and renders what it gets back.
 */
export default async function projectStateWizardController(fastify: FastifyInstance) {
    // Starts a new wizard: creates the (locked) project and returns its state
    fastify.post<{ Body: WizardStartInput }>("/projects/wizard", async (request, reply) => {
        const state = await new ProjectWizardService(request.databaseUser).start(request.body, request.databaseUser._id)
        return reply.status(201).send(state)
    })

    // Layout of the wizard (steps, order, slugs): the client builds its stepper
    // from this instead of hardcoding the flow
    fastify.get("/projects/wizard/steps", async (_request, reply) => {
        return reply.send(ProjectWizardService.getStepsLayout())
    })

    // Wizard of the current user that is still running, if any
    fastify.get("/projects/wizard/pending", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).getPending(request.databaseUser._id))
    })

    fastify.get<{ Params: ProjectIdParams }>("/projects/wizard/:projectId", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).getState(request.params.projectId))
    })

    fastify.put<{ Params: ProjectIdParams }>("/projects/wizard/:projectId/next", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).next(request.params.projectId))
    })

    fastify.put<{ Params: ProjectIdParams }>("/projects/wizard/:projectId/prev", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).prev(request.params.projectId))
    })

    fastify.put<{ Params: ProjectIdParams }>("/projects/wizard/:projectId/skip", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).skip(request.params.projectId))
    })

    // Re-opens an already completed step (going forward is rejected)
    fastify.put<{ Params: ProjectIdParams & { step: string } }>("/projects/wizard/:projectId/go-to/:step", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).goTo(request.params.projectId, request.params.step))
    })

    // Saves the main data step and moves on
    fastify.put<{ Params: ProjectIdParams; Body: WizardStartInput }>("/projects/wizard/:projectId/main-data", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).saveMainData(request.params.projectId, request.body))
    })

    fastify.get<{ Params: ProjectIdParams }>("/projects/wizard/:projectId/recap", async (request, reply) => {
        return reply.send(await new ProjectWizardService(request.databaseUser).getSetupRecap(request.params.projectId))
    })

    // Gives up the setup: removes the half configured project
    fastify.delete<{ Params: ProjectIdParams }>("/projects/wizard/:projectId", async (request, reply) => {
        await new ProjectWizardService(request.databaseUser).abort(request.params.projectId)
        return reply.status(204).send()
    })
}
