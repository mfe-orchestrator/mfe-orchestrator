import { createHash } from "node:crypto"
import { redisClient } from "../plugins/redis"

/**
 * Short-lived memory of which API keys were found valid, for the MCP endpoint.
 *
 * Keys are stored bcrypt-hashed, so recognising one means comparing it with every live key: fine
 * for a CI upload, too slow for an MCP client calling a tool every few seconds. A positive answer
 * is remembered for at most 60 seconds (never past the key's own expiry), under a SHA-256 of the
 * key, so the cache holds nothing that can be presented as a key. Revoking or deleting a key from
 * the console drops its entry at once; anything else that ends a key takes effect within the TTL.
 */

export interface CachedApiKeyCredential {
    apiKeyId: string
    projectId: string
    role: string
    /** Milliseconds since epoch */
    expiresAt: number
}

export const API_KEY_CACHE_TTL_MS = 60_000
/** Without Redis each process keeps its own copy: bounded, so a flood of distinct keys cannot grow it. */
const MAX_MEMORY_ENTRIES = 1000

const memory = new Map<string, { credential: CachedApiKeyCredential; until: number }>()

const redisKey = (hash: string) => `mcp:apikey:${hash}`
const redisIndexKey = (apiKeyId: string) => `mcp:apikey:id:${apiKeyId}`

export const hashApiKey = (apiKey: string): string => createHash("sha256").update(apiKey).digest("hex")

const ttlFor = (credential: CachedApiKeyCredential, now = Date.now()) => Math.min(API_KEY_CACHE_TTL_MS, credential.expiresAt - now)

export const getCachedApiKeyCredential = async (hash: string): Promise<CachedApiKeyCredential | undefined> => {
    const now = Date.now()
    if (redisClient) {
        const stored = await redisClient.get(redisKey(hash))
        const credential = stored ? (JSON.parse(stored) as CachedApiKeyCredential) : undefined
        return credential && credential.expiresAt > now ? credential : undefined
    }
    const entry = memory.get(hash)
    if (!entry || entry.until <= now || entry.credential.expiresAt <= now) {
        memory.delete(hash)
        return undefined
    }
    return entry.credential
}

export const cacheApiKeyCredential = async (hash: string, credential: CachedApiKeyCredential): Promise<void> => {
    const ttlMs = ttlFor(credential)
    if (ttlMs <= 0) return
    if (redisClient) {
        const seconds = Math.max(1, Math.floor(ttlMs / 1000))
        await redisClient.set(redisKey(hash), JSON.stringify(credential), { EX: seconds })
        await redisClient.set(redisIndexKey(credential.apiKeyId), hash, { EX: seconds })
        return
    }
    if (memory.size >= MAX_MEMORY_ENTRIES) {
        // Oldest first: a Map iterates in insertion order
        memory.delete(memory.keys().next().value as string)
    }
    memory.set(hash, { credential, until: Date.now() + ttlMs })
}

/** Forgets a key, so its revocation reaches the MCP endpoint without waiting for the TTL. */
export const invalidateApiKeyCredential = async (apiKeyId: string): Promise<void> => {
    if (redisClient) {
        const hash = await redisClient.get(redisIndexKey(apiKeyId))
        if (hash) await redisClient.del(redisKey(hash))
        await redisClient.del(redisIndexKey(apiKeyId))
        return
    }
    for (const [hash, entry] of memory) {
        if (entry.credential.apiKeyId === apiKeyId) memory.delete(hash)
    }
}

/** Tests only: every scenario starts from an empty cache. */
export const clearApiKeyCredentialCache = () => memory.clear()
