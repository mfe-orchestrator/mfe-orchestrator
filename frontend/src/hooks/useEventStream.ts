import { useEffect, useRef, useState } from "react"

/** Backoff between reconnection attempts, capped so a long outage still retries regularly. */
const RECONNECT_BASE_DELAY_MS = 2_000
const RECONNECT_MAX_DELAY_MS = 30_000

export interface UseEventStreamOptions<T> {
    url: string
    /** Named SSE event to listen for. Frames carrying any other name are ignored. */
    eventName: string
    enabled?: boolean
    /** Resolved right before every connection attempt, so a refreshed token is picked up on reconnect. */
    getHeaders?: () => Promise<Record<string, string | undefined>> | Record<string, string | undefined>
    /**
     * Anything outside the URL that decides what the stream returns — a scope carried
     * in a header, for instance. Changing it drops the connection and opens a new one,
     * which the URL alone could not express.
     */
    connectionKey?: string
    onEvent: (data: T) => void
}

export interface EventStreamState {
    connected: boolean
    error?: Error
}

interface ParsedFrame {
    event?: string
    data: string
}

/**
 * Parses one SSE frame, i.e. the text between two blank lines.
 *
 * Lines opening with `:` are comments — the server sends them as heartbeats — and
 * a frame made only of those yields no data, which is how heartbeats stay invisible
 * to the caller.
 */
const parseFrame = (frame: string): ParsedFrame => {
    let event: string | undefined
    const dataLines: string[] = []

    for (const line of frame.split("\n")) {
        if (!line || line.startsWith(":")) continue
        const separatorIndex = line.indexOf(":")
        const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
        // A single leading space after the colon is part of the framing, not the value.
        const value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1).replace(/^ /, "")

        if (field === "event") event = value
        else if (field === "data") dataLines.push(value)
    }

    return { event, data: dataLines.join("\n") }
}

/**
 * Hands every complete frame in the buffer to `onFrame` and returns what is left.
 *
 * A read can end mid-frame, so the trailing partial frame stays in the buffer until
 * the bytes that finish it arrive.
 */
const drainFrames = (buffer: string, onFrame: (frame: string) => void): string => {
    let rest = buffer
    let separatorIndex = rest.indexOf("\n\n")

    while (separatorIndex !== -1) {
        onFrame(rest.slice(0, separatorIndex))
        rest = rest.slice(separatorIndex + 2)
        separatorIndex = rest.indexOf("\n\n")
    }

    return rest
}

/**
 * Subscribes to a Server-Sent Events endpoint over `fetch`.
 *
 * `EventSource` is not usable here: it cannot send the Authorization and Project-Id
 * headers every API call in this console needs, and moving the token into the query
 * string would leak it into access logs. Reading the response body as a stream costs
 * us the automatic reconnection `EventSource` provides, so that is reimplemented
 * below with a capped backoff.
 */
const useEventStream = <T>({ url, eventName, enabled = true, getHeaders, connectionKey, onEvent }: UseEventStreamOptions<T>): EventStreamState => {
    const [state, setState] = useState<EventStreamState>({ connected: false })

    // Kept in refs so a new callback identity on every render does not tear the
    // connection down and open a fresh one.
    const onEventRef = useRef(onEvent)
    onEventRef.current = onEvent
    const getHeadersRef = useRef(getHeaders)
    getHeadersRef.current = getHeaders

    // biome-ignore lint/correctness/useExhaustiveDependencies: connectionKey is read through getHeaders, which is held in a ref; listing it here is what makes a scope change reopen the stream.
    useEffect(() => {
        if (!enabled) {
            setState({ connected: false })
            return
        }

        const abortController = new AbortController()
        let attempt = 0
        let stopped = false
        let reconnectTimeout: ReturnType<typeof setTimeout> | undefined

        const emit = (data: string) => {
            try {
                onEventRef.current(JSON.parse(data) as T)
            } catch (parseError) {
                console.error("Unable to parse event stream payload", parseError)
            }
        }

        const readStream = async () => {
            const rawHeaders = (await getHeadersRef.current?.()) ?? {}
            const headers: Record<string, string> = { Accept: "text/event-stream" }
            for (const [key, value] of Object.entries(rawHeaders)) {
                if (value) headers[key] = value
            }

            const response = await fetch(url, {
                headers,
                signal: abortController.signal,
                // Long-lived responses must never be served from the HTTP cache.
                cache: "no-store"
            })

            if (!response.ok || !response.body) {
                throw new Error(`Event stream failed with status ${response.status}`)
            }

            attempt = 0
            setState({ connected: true })

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            while (!stopped) {
                const { done, value } = await reader.read()
                if (done) break

                buffer = drainFrames(buffer + decoder.decode(value, { stream: true }), frame => {
                    const parsed = parseFrame(frame)
                    if (parsed.event === eventName && parsed.data) {
                        emit(parsed.data)
                    }
                })
            }
        }

        const connect = async () => {
            try {
                await readStream()
                // The server closed the stream: fall through to the retry below.
                if (!stopped) throw new Error("Event stream closed")
            } catch (error) {
                if (stopped || abortController.signal.aborted) return

                setState({ connected: false, error: error as Error })

                attempt += 1
                const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1), RECONNECT_MAX_DELAY_MS)
                reconnectTimeout = setTimeout(connect, delay)
            }
        }

        connect()

        return () => {
            stopped = true
            if (reconnectTimeout) clearTimeout(reconnectTimeout)
            abortController.abort()
        }
    }, [url, eventName, enabled, connectionKey])

    return state
}

export default useEventStream
