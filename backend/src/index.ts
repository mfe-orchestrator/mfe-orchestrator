import AutoLoad from "@fastify/autoload"
import * as Sentry from "@sentry/node"
import dotenv from "dotenv"
import Fastify from "fastify"
import path from "path"
import wellKnownRoutes from "./mcp/wellKnownRoutes"
import { AppInstance } from "./types/fastify"
import { parseTrustProxy, redactOAuthUrl } from "./utils/oauthConfig"

// The instance below is built at import time, before `start` loads the .env file: TRUST_PROXY has to
// be readable by then.
dotenv.config()

/**
 * How long a plugin is given to come up.
 *
 * Above Fastify's 10s default because the database plugin waits for the data migrations before
 * declaring itself ready, and a migration that touches every project of an installation can take
 * longer than that on a remote database. Exceeding the limit does not degrade anything: it makes
 * `build()` throw, so the process never starts listening and the whole console is down.
 */
const PLUGIN_TIMEOUT_MS = 60_000

export const fastify: AppInstance = Fastify({
    logger: {
        serializers: {
            // Fastify's default request serializer, with the OAuth consent handle masked out of the URL
            req: request => ({
                method: request.method,
                url: redactOAuthUrl(request.url),
                host: request.host,
                remoteAddress: request.ip,
                remotePort: request.socket?.remotePort
            })
        }
    },
    pluginTimeout: PLUGIN_TIMEOUT_MS,
    // Behind nginx every request arrives from 127.0.0.1: without trusting the proxy, `request.ip`
    // and with it every per-IP rate limit (client registration included) is one shared bucket.
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY)
})

export async function build() {
    const startPlugins = performance.now()
    await fastify.register(AutoLoad, {
        dir: path.join(__dirname, "plugins")
    })
    fastify.log.info(`Plugins ${(performance.now() - startPlugins).toFixed(2)} ms`)

    const startControllers = performance.now()

    // At the root whatever the controllers' prefix: discovery documents are looked up there
    await fastify.register(wellKnownRoutes)

    // Registra i controller con prefix '/api' solo in development
    const isDevelopment = process.env.NODE_ENV === "development"
    const registerControllers = async (fastify: AppInstance) => {
        await fastify.register(AutoLoad, {
            dir: path.join(__dirname, "controller")
        })
    }

    if (isDevelopment) {
        // In development: registra tutti i controller sotto il prefix '/api'
        await fastify.register(registerControllers, { prefix: "/api" })
        fastify.log.info("Development mode: Controllers registered with /api prefix")
    } else {
        // In production: registra i controller senza prefix
        await registerControllers(fastify)
        fastify.log.info("Production mode: Controllers registered without prefix")
    }

    fastify.log.info(`Controllers ${(performance.now() - startControllers).toFixed(2)} ms`)

    return fastify
}

const initSentry = async (fastify: AppInstance) => {
    if (!process.env.SENTRY_DSN) {
        fastify.log.warn("Sentry DSN not found")
        return
    }
    // Errors of the routes are captured by the Fastify integration through its diagnostics channel.
    await Sentry.init({
        dsn: process.env.SENTRY_DSN,
        // Collected by default since Sentry 11 and never sent before: query parameters and local
        // variables can hold the secrets of a project or a token.
        dataCollection: {
            databaseQueryData: false,
            stackFrameVariables: false
        }
    })
}

const start = async () => {
    dotenv.config()

    let fastify: AppInstance

    const start = performance.now()
    try {
        fastify = await build()
        await initSentry(fastify)
    } catch (e) {
        console.error("Error occured while building fastify")
        console.error(e)
        return
    }

    fastify.log.info(`Successfully built fastify instance in ${(performance.now() - start).toFixed(2)} ms`)

    await fastify.listen({
        host: "0.0.0.0",
        port: fastify.config.PORT
    })
}

// Services import the `fastify` instance from here: under Vitest that import must not start the
// server, or the plugin autoload runs in the test worker and logs its failure after the file ends.
if (!process.env.VITEST) {
    start()
}
