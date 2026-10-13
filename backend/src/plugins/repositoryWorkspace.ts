import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"
import { evictUnusedWorkspaces } from "../service/workspace/RepositoryWorkspaceService"

const EVICTION_EVERY_MS = 6 * 60 * 60 * 1000

/**
 * Keeps REPOSITORIES_FOLDER from growing forever: working copies nobody used for
 * REPOSITORIES_EVICT_AFTER_DAYS are deleted every few hours. They are a cache, the next request
 * clones them again.
 */
export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        const evict = async () => {
            try {
                const evicted = await evictUnusedWorkspaces(fastify.config.REPOSITORIES_FOLDER, fastify.config.REPOSITORIES_EVICT_AFTER_DAYS)
                if (evicted > 0) fastify.log.info({ evicted }, "Evicted unused repository working copies")
            } catch (error) {
                fastify.log.warn({ err: error }, "Repository working copies eviction failed")
            }
        }
        const interval = setInterval(evict, EVICTION_EVERY_MS)
        interval.unref()
        fastify.addHook("onClose", async () => clearInterval(interval))
    },
    { name: "repositoryWorkspace", dependencies: ["config"] }
)
