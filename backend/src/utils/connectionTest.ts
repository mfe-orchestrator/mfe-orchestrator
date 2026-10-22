import { FastifyRequest } from "fastify"
import AuthenticationMethod from "../types/AuthenticationMethod"

/** What a connection test answers: whether it worked, and what the other side said when it did not */
export interface ConnectionTestResultDTO {
    ok: boolean
    message?: string
}

/**
 * Each test opens a connection from the server to wherever the form points: console sessions only, and a
 * few a minute per user across every test route (one counter for all of them), plenty for a person and
 * too few to sweep a network with.
 */
export const CONNECTION_TEST_ROUTE_CONFIG = {
    authMethod: AuthenticationMethod.JWT,
    rateLimit: {
        max: 10,
        timeWindow: "1 minute",
        groupId: "connection-test",
        hook: "preHandler" as const,
        keyGenerator: (request: FastifyRequest) => request.databaseUser?._id?.toString() ?? request.ip
    }
}

/** The clients have their own timeouts; this one only stops a test that none of them would end */
export const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> => {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000} seconds`)), ms)
    })
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const MAX_MESSAGE_LENGTH = 500

/**
 * The first error down the chain that says something: a refused connection to a host with several
 * addresses is an AggregateError with no message of its own, and the HTTP clients of the storages keep
 * the network failure in `cause`.
 */
const messageOf = (error: unknown): string => {
    let current = error
    for (let depth = 0; depth < 5 && current instanceof Error; depth++) {
        if (current.message) return current.message
        current = current instanceof AggregateError && current.errors.length > 0 ? current.errors[0] : current.cause
    }
    if (current instanceof Error) return (current as { code?: string }).code || current.name
    return String(current)
}

/**
 * Runs a test and turns its failure into the answer: an unreachable host is what the user asked about,
 * not an error of the API. The credentials are blanked out of what the client said, in case it quoted them.
 */
export const runConnectionTest = async (test: () => Promise<void>, secrets: unknown[]): Promise<ConnectionTestResultDTO> => {
    try {
        await test()
        return { ok: true }
    } catch (error) {
        let message = messageOf(error)
        // As typed and as a URL carries it: a client may quote either
        for (const secret of secrets) {
            if (typeof secret !== "string" || secret.length === 0) continue
            for (const form of new Set([secret, encodeURIComponent(secret)])) message = message.split(form).join("•••")
        }
        return { ok: false, message: message.slice(0, MAX_MESSAGE_LENGTH) }
    }
}
