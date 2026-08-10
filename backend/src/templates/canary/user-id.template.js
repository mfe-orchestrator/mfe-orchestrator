/**
 * Canary shim - user strategy (CanaryType.ON_USER).
 *
 * Same mechanics as `is-canary.template.js`: rendered on the fly and served in place of
 * the microfrontend `remoteEntry.js`, at the static URL the consumer already has in its
 * build config. Here the variant is not a coin flip but a per-user lookup: the shim
 * resolves the current user id in the host page, asks the backend whether that user is
 * enrolled in the canary (DeploymentToCanaryUsers), and loads the matching bundle.
 *
 * The enrolled-user list is deliberately NOT inlined here: this file is served from a
 * public endpoint, so embedding it would expose user identifiers to anyone fetching the
 * URL. The cost is one round trip before the bundle loads, capped by DECISION_TIMEOUT_MS.
 *
 * Placeholders (all inside string literals, so this file stays valid JS):
 *   {{CONTAINER_NAME}}        Module Federation container global, e.g. "checkout"
 *   {{STABLE_URL}}            Absolute URL of the stable remoteEntry.js
 *   {{CANARY_URL}}            Absolute URL of the canary remoteEntry.js
 *   {{DECISION_URL}}          Endpoint answering {"canary": true|false} for ?userId=
 *   {{USER_ID_COOKIE}}        Host cookie holding the user id (may be empty)
 *   {{USER_ID_STORAGE_KEY}}   Host localStorage key holding the user id (may be empty)
 *   {{DECISION_TIMEOUT_MS}}   Budget for the lookup before degrading to stable
 *   {{CACHE_DECISION}}        "true" to memoize the answer in sessionStorage
 *   {{ALLOW_QUERY_OVERRIDE}}  "true" to honour ?mfeo_canary=1|0 (handy for QA)
 *
 * The user id travels as a query parameter and will therefore land in access logs, on
 * every proxy in between. Use an opaque identifier, never an email or a plain username.
 *
 * DECISION_URL must allow the host origin in CORS, and this file must be served with
 * `Cache-Control: no-store`.
 */
;(() => {
    const CONTAINER_NAME = "{{CONTAINER_NAME}}"
    const STABLE_URL = "{{STABLE_URL}}"
    const CANARY_URL = "{{CANARY_URL}}"
    const DECISION_URL = "{{DECISION_URL}}"
    const USER_ID_COOKIE = "{{USER_ID_COOKIE}}"
    const USER_ID_STORAGE_KEY = "{{USER_ID_STORAGE_KEY}}"
    const DECISION_TIMEOUT_MS = Number("{{DECISION_TIMEOUT_MS}}") || 2000
    const CACHE_DECISION = "{{CACHE_DECISION}}" === "true"
    const ALLOW_QUERY_OVERRIDE = "{{ALLOW_QUERY_OVERRIDE}}" === "true"

    // Read synchronously: `document.currentScript` is null inside async callbacks.
    const currentScript = document.currentScript
    const crossOrigin = currentScript ? currentScript.crossOrigin : null

    /**
     * Cookie lookup by exact name. Deliberately not regex-based: the name would end up
     * being interpreted as a pattern.
     */
    const readCookie = name => {
        if (!name) return null
        const raw = document.cookie
        if (!raw) return null
        for (const chunk of raw.split(";")) {
            const part = chunk.trim()
            if (part.startsWith(`${name}=`)) {
                const value = part.slice(name.length + 1)
                try {
                    return decodeURIComponent(value)
                } catch {
                    return value
                }
            }
        }
        return null
    }

    const isTruthy = value => value === "true" || value === "1" || value === "yes"
    const isFalsy = value => value === "false" || value === "0" || value === "no"

    /** FNV-1a, 32 bit - used to key the cache without storing the raw user id. */
    const hash = str => {
        let h = 2166136261
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i)
            h = Math.imul(h, 16777619)
        }
        return (h >>> 0).toString(36)
    }

    /**
     * Resolves the current user id from the host page, in order of precedence:
     *   1. `window.__mfeoUserId` - string, or function returning string/Promise. This is
     *      the escape hatch for apps that keep the id in a JWT or in app state rather
     *      than in a readable cookie.
     *   2. the host cookie named USER_ID_COOKIE
     *   3. the host localStorage entry named USER_ID_STORAGE_KEY
     * Resolves to null when the user is anonymous or unknown.
     */
    const resolveUserId = () =>
        new Promise(resolve => {
            const provided = window.__mfeoUserId

            if (typeof provided === "function") {
                try {
                    resolve(Promise.resolve(provided()))
                } catch {
                    resolve(null)
                }
                return
            }

            if (typeof provided === "string" && provided) {
                resolve(provided)
                return
            }

            const fromCookie = readCookie(USER_ID_COOKIE)
            if (fromCookie) {
                resolve(fromCookie)
                return
            }

            try {
                if (USER_ID_STORAGE_KEY) {
                    resolve(window.localStorage.getItem(USER_ID_STORAGE_KEY) || null)
                    return
                }
            } catch {
                /* storage unavailable */
            }

            resolve(null)
        }).then(value => (typeof value === "string" && value ? value : null))

    const cacheKey = userId => `mfeo_canary:${CONTAINER_NAME}:${hash(userId)}`

    const readCachedDecision = userId => {
        if (!CACHE_DECISION) return null
        try {
            const cached = window.sessionStorage.getItem(cacheKey(userId))
            if (cached === "1") return true
            if (cached === "0") return false
        } catch {
            /* storage unavailable */
        }
        return null
    }

    const writeCachedDecision = (userId, isCanary) => {
        if (!CACHE_DECISION) return
        try {
            window.sessionStorage.setItem(cacheKey(userId), isCanary ? "1" : "0")
        } catch {
            /* storage unavailable */
        }
    }

    /**
     * Asks the backend whether this user is enrolled. Any failure - network, timeout,
     * non-2xx, malformed body - resolves to false: an unreachable orchestrator must
     * leave the host on the stable bundle rather than block it.
     */
    const askBackend = userId => {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null
        const timer = window.setTimeout(() => controller?.abort(), DECISION_TIMEOUT_MS)

        const separator = DECISION_URL.includes("?") ? "&" : "?"
        const url = `${DECISION_URL}${separator}userId=${encodeURIComponent(userId)}`

        return fetch(url, controller ? { signal: controller.signal } : undefined)
            .then(response => (response.ok ? response.json() : null))
            .then(body => !!body?.canary)
            .catch(() => false)
            .then(isCanary => {
                window.clearTimeout(timer)
                return isCanary
            })
    }

    const queryOverride = () => {
        if (!ALLOW_QUERY_OVERRIDE) return null
        try {
            const value = new URLSearchParams(window.location.search).get("mfeo_canary")
            if (value === null) return null
            if (isTruthy(value)) return true
            if (isFalsy(value)) return false
        } catch {
            /* malformed query string */
        }
        return null
    }

    const pickUrl = () => {
        const override = queryOverride()
        if (override !== null) return Promise.resolve(override ? CANARY_URL : STABLE_URL)

        return resolveUserId().then(userId => {
            // Anonymous users are never canary: there is nothing to key stickiness on.
            if (!userId) return STABLE_URL

            const cached = readCachedDecision(userId)
            if (cached !== null) return cached ? CANARY_URL : STABLE_URL

            return askBackend(userId).then(isCanary => {
                writeCachedDecision(userId, isCanary)
                return isCanary ? CANARY_URL : STABLE_URL
            })
        })
    }

    /**
     * Loads the real remoteEntry and hands back its container.
     *
     * The real bundle installs itself on `window[CONTAINER_NAME]`, overwriting this proxy.
     * We grab it in `onload` - which fires synchronously right after the script body ran,
     * before anything else can look at the global - and immediately put the proxy back, so
     * the host's webpack runtime only ever sees the proxy.
     */
    const loadScript = url =>
        new Promise((resolve, reject) => {
            const proxy = window[CONTAINER_NAME]
            const element = document.createElement("script")
            element.src = url
            element.async = true
            if (crossOrigin) element.crossOrigin = crossOrigin

            element.onload = () => {
                const container = window[CONTAINER_NAME]
                window[CONTAINER_NAME] = proxy
                if (!container || container === proxy) {
                    reject(new Error(`[mfe-orchestrator] ${url} did not define the container '${CONTAINER_NAME}'`))
                    return
                }
                resolve(container)
            }

            element.onerror = () => {
                window[CONTAINER_NAME] = proxy
                reject(new Error(`[mfe-orchestrator] failed to load ${url}`))
            }

            document.head.appendChild(element)
        })

    let containerPromise = null

    const loadContainer = () => {
        if (containerPromise) return containerPromise
        containerPromise = pickUrl().then(url =>
            loadScript(url).catch(error => {
                // A broken canary must not take the host down: degrade to stable.
                if (url === CANARY_URL && CANARY_URL !== STABLE_URL) {
                    if (typeof console !== "undefined" && console.warn) {
                        console.warn(`[mfe-orchestrator] canary bundle for '${CONTAINER_NAME}' failed, falling back to stable`, error)
                    }
                    return loadScript(STABLE_URL)
                }
                throw error
            })
        )
        return containerPromise
    }

    // Proxy container. `init` and `get` are promise-returning by contract, so deferring
    // both the lookup and the bundle load behind them is transparent to the host runtime.
    if (!window[CONTAINER_NAME]?.__mfeoCanaryProxy) {
        window[CONTAINER_NAME] = {
            __mfeoCanaryProxy: true,
            init: (...args) => loadContainer().then(container => container.init(...args)),
            get: moduleName => loadContainer().then(container => container.get(moduleName))
        }
    }
})()
