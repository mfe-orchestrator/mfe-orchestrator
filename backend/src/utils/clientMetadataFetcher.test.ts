import { EventEmitter } from "node:events"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const resolved = vi.hoisted(() => ({ addresses: [] as { address: string; family: number }[] }))
vi.mock("node:dns", async importOriginal => {
    const original = await importOriginal<typeof import("node:dns")>()
    return {
        ...original,
        lookup: (_hostname: string, _options: unknown, callback: (error: Error | null, addresses: { address: string; family: number }[]) => void) => callback(null, resolved.addresses)
    }
})

/** A server that answers 200 and then sends one byte every second, forever. */
const trickle = vi.hoisted(() => ({ request: undefined as unknown }))
vi.mock("node:https", async () => {
    const { EventEmitter: Emitter } = await import("node:events")
    return {
        default: {
            get: (_url: string, _options: unknown, onResponse: (response: unknown) => void) => {
                const request = Object.assign(new Emitter(), {
                    destroy: (error?: Error) => {
                        if (error) request.emit("error", error)
                        request.emit("close")
                    }
                })
                const response = Object.assign(new Emitter(), { statusCode: 200, resume: () => undefined })
                const drip = setInterval(() => response.emit("data", Buffer.from(" ")), 1000)
                request.on("close", () => clearInterval(drip))
                trickle.request = request
                setTimeout(() => onResponse(response), 0)
                return request
            }
        }
    }
})

import { fetchClientMetadataDocument, isPublicAddress, publicOnlyLookup, validateClientIdUrl } from "./clientMetadataFetcher"

describe("isPublicAddress", () => {
    it.each(["8.8.8.8", "140.82.112.3", "2606:4700:4700::1111"])("given the public address %s, when checked, then it may be fetched", address => {
        expect(isPublicAddress(address)).toBe(true)
    })

    it.each([
        ["loopback", "127.0.0.1"],
        ["a private network", "10.1.2.3"],
        ["a private network", "192.168.1.10"],
        ["a private network", "172.20.0.5"],
        ["the cloud metadata endpoint", "169.254.169.254"],
        ["carrier grade NAT", "100.64.0.1"],
        ["the unspecified address", "0.0.0.0"],
        ["IPv6 loopback", "::1"],
        ["an IPv6 unique local address", "fd00::1"],
        ["an IPv6 link local address", "fe80::1"],
        ["an IPv4-mapped private address", "::ffff:10.0.0.1"],
        ["an IPv4-compatible address", "::10.0.0.1"],
        ["a 6to4 address", "2002:a00:1::1"],
        ["a Teredo address", "2001:0:4136:e378:8000:63bf:3fff:fdd2"],
        ["a local-use NAT64 address", "64:ff9b:1::a00:1"],
        ["a well-known NAT64 address", "64:ff9b::a00:1"],
        ["something that is not an address", "localhost"]
    ])("given %s (%s), when checked, then it is refused", (_case, address) => {
        expect(isPublicAddress(address)).toBe(false)
    })
})

describe("validateClientIdUrl", () => {
    it("given an https URL with a path, when validated, then it can be a client id", () => {
        expect(validateClientIdUrl("https://client.example.com/oauth/metadata.json")).toBeUndefined()
    })

    it.each([
        ["plain http", "http://client.example.com/metadata.json"],
        ["no path", "https://client.example.com/"],
        ["a fragment", "https://client.example.com/metadata.json#x"],
        ["credentials", "https://user:pw@client.example.com/metadata.json"],
        ["an IP literal", "https://169.254.169.254/latest/meta-data"],
        ["an IPv6 literal", "https://[::1]/metadata.json"],
        ["dot segments", "https://client.example.com/a/../metadata.json"]
    ])("given a client id with %s, when validated, then it is refused", (_case, clientId) => {
        expect(validateClientIdUrl(clientId)).toBeDefined()
    })

    it("given an allow-list, when a host outside it is validated, then it is refused", () => {
        expect(validateClientIdUrl("https://evil.example.net/metadata.json", ["claude.ai"])).toMatch(/not allowed/)
        expect(validateClientIdUrl("https://claude.ai/oauth/metadata.json", ["claude.ai"])).toBeUndefined()
    })
})

describe("publicOnlyLookup", () => {
    beforeEach(() => {
        resolved.addresses = []
    })

    const lookup = (options: { all?: boolean }) =>
        new Promise<{ error: Error | null; address: unknown }>(resolve => publicOnlyLookup("client.example.com", options, (error, address) => resolve({ error, address })))

    it("given a name resolving to public addresses only, when looked up, then the connection may proceed to them", async () => {
        resolved.addresses = [{ address: "93.184.216.34", family: 4 }]

        const { error, address } = await lookup({})

        expect(error).toBeNull()
        expect(address).toBe("93.184.216.34")
    })

    it("given a name resolving to a public and a private address, when looked up, then it is refused (no rebinding through a second record)", async () => {
        resolved.addresses = [
            { address: "93.184.216.34", family: 4 },
            { address: "10.0.0.5", family: 4 }
        ]

        const { error } = await lookup({ all: true })

        expect(error?.message).toMatch(/non public/)
    })

    it("given a name resolving to the metadata endpoint, when looked up, then it is refused", async () => {
        resolved.addresses = [{ address: "169.254.169.254", family: 4 }]

        const { error } = await lookup({})

        expect(error).not.toBeNull()
    })
})

describe("fetchClientMetadataDocument", () => {
    afterEach(() => vi.useRealTimers())

    it("given a server that keeps trickling bytes, when the document is fetched, then the request is abandoned at the deadline", async () => {
        vi.useFakeTimers()

        const fetched = fetchClientMetadataDocument("https://client.example.com/metadata.json", { timeoutMs: 5000 })
        const outcome = expect(fetched).rejects.toThrow(/timed out/)
        await vi.advanceTimersByTimeAsync(5001)

        await outcome
        expect(trickle.request).toBeInstanceOf(EventEmitter)
    })
})
