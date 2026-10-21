import { FastifyInstance } from "fastify"
import ArgoCdService, { ArgoCdInitializeInput } from "../service/ArgoCdService"

export default async function argoCdController(fastify: FastifyInstance) {
    // Where the project is deployed from, never the credentials
    fastify.get<{ Params: { projectId: string } }>("/projects/:projectId/argocd", async (request, reply) => {
        return reply.send(await new ArgoCdService(request.databaseUser).get(request.params.projectId))
    })

    // Initializes Argo CD for the project, or re-aligns it with the environments and the repositories of now
    fastify.post<{ Params: { projectId: string }; Body: ArgoCdInitializeInput }>("/projects/:projectId/argocd/initialize", async (request, reply) => {
        return reply.send(await new ArgoCdService(request.databaseUser).initialize(request.params.projectId, request.body))
    })
}
