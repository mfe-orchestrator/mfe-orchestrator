/**
 * Where the console API answers, as seen from outside: BACKEND_URL when it is deployed on its own
 * host, otherwise the frontend origin with the /api prefix the reverse proxy mounts it on.
 *
 * Read here rather than out of `fastify.config` because it also has to be resolvable while
 * generating files for someone else's repository, where there is no request to hang it off.
 */
export const getBackendUrl = (): string => {
    return process.env.BACKEND_URL || process.env.FRONTEND_URL + "/api"
}
