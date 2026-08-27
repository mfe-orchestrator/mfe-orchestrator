import AutoLoad from "@fastify/autoload"
import * as Sentry from "@sentry/node"
import dotenv from "dotenv"
import Fastify from "fastify"
import path from "path"
import { AppInstance } from "./types/fastify"

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
    logger: true,
    pluginTimeout: PLUGIN_TIMEOUT_MS
})

export async function build() {
    const startPlugins = performance.now()
    await fastify.register(AutoLoad, {
        dir: path.join(__dirname, "plugins")
    })
    fastify.log.info(`Plugins ${(performance.now() - startPlugins).toFixed(2)} ms`)

    const startControllers = performance.now()

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
    await Sentry.init({
        dsn: process.env.SENTRY_DSN,
        sendDefaultPii: true,
        enableLogs: true
    })

    await Sentry.setupFastifyErrorHandler(fastify)
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

start()
