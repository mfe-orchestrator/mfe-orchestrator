import axios from "axios"

export interface NpmPackageInfo {
    name: string
    latest?: string
    deprecated?: boolean
    modifiedAt?: string
}

interface NpmAbbreviatedPackument {
    name: string
    "dist-tags"?: Record<string, string>
    modified?: string
    versions?: Record<string, { deprecated?: string }>
}

const DEFAULT_REGISTRY_URL = "https://registry.npmjs.org"
const CACHE_TTL_MS = 1000 * 60 * 60
const REQUEST_TIMEOUT_MS = 10_000
const DEFAULT_CONCURRENCY = 8

interface CacheEntry {
    expiresAt: number
    value: NpmPackageInfo | null
}

const cache = new Map<string, CacheEntry>()

export const clearNpmRegistryCache = () => cache.clear()

class NpmRegistryClient {
    private readonly registryUrl: string

    constructor(registryUrl?: string) {
        this.registryUrl = (registryUrl || process.env.NPM_REGISTRY_URL || DEFAULT_REGISTRY_URL).replace(/\/+$/, "")
    }

    private buildUrl(packageName: string): string {
        // Scoped packages must keep the leading "@" but escape every other reserved
        // character, so a crafted name cannot escape the registry path segment.
        const encodedName = encodeURIComponent(packageName).replace(/^%40/, "@")
        return `${this.registryUrl}/${encodedName}`
    }

    /**
     * Returns the published metadata of a package, or null when the package is unknown
     * to the registry (private packages, typos, no network access, ...).
     */
    async getPackageInfo(packageName: string): Promise<NpmPackageInfo | null> {
        const cacheKey = `${this.registryUrl}:${packageName}`
        const cached = cache.get(cacheKey)
        if (cached && cached.expiresAt > Date.now()) {
            return cached.value
        }

        let value: NpmPackageInfo | null = null

        try {
            const response = await axios.request<NpmAbbreviatedPackument>({
                url: this.buildUrl(packageName),
                timeout: REQUEST_TIMEOUT_MS,
                headers: {
                    // Abbreviated metadata: same dist-tags with a much smaller payload
                    Accept: "application/vnd.npm.install-v1+json",
                    "User-Agent": "MFE-Orchestrator"
                }
            })

            const latest = response.data["dist-tags"]?.latest

            value = {
                name: response.data.name || packageName,
                latest,
                deprecated: Boolean(latest && response.data.versions?.[latest]?.deprecated),
                modifiedAt: response.data.modified
            }
        } catch {
            // A missing or unreachable package must not break the whole analysis
            value = null
        }

        cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value })
        return value
    }

    /**
     * Resolves many packages at once with a bounded concurrency, so a project with
     * hundreds of dependencies does not open hundreds of sockets.
     */
    async getPackagesInfo(packageNames: string[], concurrency: number = DEFAULT_CONCURRENCY): Promise<Map<string, NpmPackageInfo>> {
        const uniqueNames = [...new Set(packageNames)]
        const result = new Map<string, NpmPackageInfo>()
        let cursor = 0

        const worker = async () => {
            while (cursor < uniqueNames.length) {
                const packageName = uniqueNames[cursor++]
                const info = await this.getPackageInfo(packageName)
                if (info) {
                    result.set(packageName, info)
                }
            }
        }

        await Promise.all(Array.from({ length: Math.min(concurrency, uniqueNames.length) }, worker))

        return result
    }
}

export default NpmRegistryClient
