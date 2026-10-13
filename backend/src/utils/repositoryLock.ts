import { randomUUID } from "node:crypto"
import { redisClient } from "../plugins/redis"

/** How long a lock lives without being renewed: a process that dies frees it after this. */
const LOCK_TTL_MS = 60_000
const RENEW_EVERY_MS = 20_000
const POLL_EVERY_MS = 1_000

/** Fallback when Redis is not configured: enough for the single process such an installation runs. */
const localLocks = new Set<string>()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const redisAvailable = () => Boolean(redisClient?.isOpen)

const tryAcquire = async (key: string, token: string): Promise<boolean> => {
    if (redisAvailable()) {
        return (await redisClient.set(key, token, { NX: true, PX: LOCK_TTL_MS })) === "OK"
    }
    if (localLocks.has(key)) return false
    localLocks.add(key)
    return true
}

const release = async (key: string, token: string) => {
    if (redisAvailable()) {
        // Only the holder deletes: after an expiry the key may already belong to someone else.
        await redisClient.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", { keys: [key], arguments: [token] })
    }
    // Also the local set: a lock taken while Redis was down lives there, whatever Redis does now.
    localLocks.delete(key)
}

export class RepositoryLockTimeoutError extends Error {}

/**
 * Runs `task` while holding the lock of one working copy, so two jobs never share a checkout.
 *
 * Waits up to `waitMs` for the lock, calling `onWait` once when it has to; the lock is renewed while
 * the task runs and released however it ends.
 */
export const withRepositoryLock = async <T>(name: string, task: () => Promise<T>, { waitMs = 10 * 60_000, onWait }: { waitMs?: number; onWait?: () => void | Promise<void> } = {}): Promise<T> => {
    const key = `repo-lock:${name}`
    const token = randomUUID()
    const deadline = Date.now() + waitMs
    let notified = false

    while (!(await tryAcquire(key, token))) {
        if (Date.now() > deadline) {
            throw new RepositoryLockTimeoutError(`The repository is busy with another request`)
        }
        if (!notified) {
            notified = true
            await onWait?.()
        }
        await sleep(POLL_EVERY_MS)
    }

    // Extends only a lock still held with this token: after an expiry the key may belong to another job.
    const renew = setInterval(() => {
        if (!redisAvailable()) return
        redisClient
            .eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end", {
                keys: [key],
                arguments: [token, String(LOCK_TTL_MS)]
            })
            .catch(() => undefined)
    }, RENEW_EVERY_MS)
    renew.unref()

    try {
        return await task()
    } finally {
        clearInterval(renew)
        await release(key, token)
    }
}
