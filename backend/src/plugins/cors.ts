import fastifyCors, { FastifyCorsOptions } from "@fastify/cors"
import { FastifyInstance, FastifyRequest } from "fastify"
import fastifyPlugin from "fastify-plugin"

// I controller sono montati sotto `/api` solo in development, quindi il
// prefisso va considerato opzionale.
const SERVE_PATH_PATTERN = /^\/(?:api\/)?serve(?:\/|$)/

const parseOrigins = (value?: string): string[] =>
    (value ?? "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)

export default fastifyPlugin(
    async (fastify: FastifyInstance) => {
        const defaultOrigins = parseOrigins(fastify.config.ALLOWED_ORIGINS)
        // Gli endpoint /serve/* sono consumati dalle applicazioni host, che
        // vivono su domini diversi dalla console: possono avere una allow-list
        // dedicata e, se non impostata, ricadono su ALLOWED_ORIGINS.
        const serveOrigins = parseOrigins(fastify.config.ALLOWED_SERVE_ORIGINS)
        const effectiveServeOrigins = serveOrigins.length > 0 ? serveOrigins : defaultOrigins

        if (defaultOrigins.length === 0 && effectiveServeOrigins.length === 0) return

        fastify.log.info("CORS enabled for " + (defaultOrigins.join(",") || "no origin"))
        fastify.log.info("CORS enabled on /serve/* for " + (effectiveServeOrigins.join(",") || "no origin"))

        await fastify.register(fastifyCors, {
            delegator: async (request: FastifyRequest): Promise<FastifyCorsOptions> => {
                const path = request.url.split("?")[0]
                const origins = SERVE_PATH_PATTERN.test(path) ? effectiveServeOrigins : defaultOrigins
                return {
                    // `false` disabilita la CORS per quella richiesta: nessun
                    // header viene aggiunto, come quando la variabile non c'è.
                    origin: origins.length > 0 ? origins : false,
                    allowedHeaders: ["*"],
                    credentials: true
                }
            }
        })
    },
    { name: "cors", dependencies: ["config"] }
)
