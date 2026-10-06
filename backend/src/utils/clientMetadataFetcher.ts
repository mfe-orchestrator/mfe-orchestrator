import { lookup as dnsLookup, LookupAddress } from "node:dns"
import https from "node:https"
import { BlockList, isIP } from "node:net"

/**
 * Fetches OAuth Client ID Metadata Documents (CIMD) without becoming a proxy into the network.
 *
 * With CIMD the `client_id` is a URL chosen by whoever starts the authorization, and the server
 * fetches it: left unchecked, that is a request to any address the backend can reach (cloud
 * metadata endpoints, the database, the admin interfaces of the cluster). Every address the name
 * resolves to is checked, and the connection goes to the very address that was checked, so a
 * DNS answer that changes between the check and the connect (rebinding) gains nothing.
 */

const NON_PUBLIC = new BlockList()
for (const [network, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4]
] as const) {
    NON_PUBLIC.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
    ["::", 128],
    ["::1", 128],
    // IPv4-compatible (deprecated) addresses embed an IPv4 host the same way the mapped ones do
    ["::", 96],
    // NAT64 prefixes translate to an arbitrary IPv4 address, private ones included
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["100::", 64],
    // Teredo and 6to4 tunnel to an IPv4 address encoded in the IPv6 one
    ["2001::", 32],
    ["2002::", 16],
    ["2001:db8::", 32],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8]
] as const) {
    NON_PUBLIC.addSubnet(network, prefix, "ipv6")
}

/** True when the address is routable on the public internet. */
export const isPublicAddress = (address: string): boolean => {
    const family = isIP(address)
    if (family === 4) {
        return !NON_PUBLIC.check(address, "ipv4")
    }
    if (family === 6) {
        // An IPv4-mapped address (::ffff:10.0.0.1) reaches the IPv4 host: judge that one
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
        if (mapped) {
            return isPublicAddress(mapped[1])
        }
        return !NON_PUBLIC.check(address, "ipv6")
    }
    return false
}

/**
 * Why a URL cannot be a CIMD client id, or undefined when it can.
 *
 * The draft requires https, a path, and no fragment; IP literals are refused on top of that, as a
 * client that wants to be identified by a URL can be expected to own a domain name.
 */
export const validateClientIdUrl = (clientId: string, allowedHosts: string[] = []): string | undefined => {
    let url: URL
    try {
        url = new URL(clientId)
    } catch {
        return "client_id is not a URL"
    }
    if (url.protocol !== "https:") return "client_id must be an https URL"
    if (url.pathname === "/" || url.pathname === "") return "client_id must contain a path"
    if (url.hash || clientId.includes("#")) return "client_id must not contain a fragment"
    if (url.username || url.password) return "client_id must not contain credentials"
    // On the raw string: URL parsing has already resolved the segments away in `pathname`
    if (/\/\.\.?(?:[/?]|$)/.test(clientId)) return "client_id must not contain dot segments"
    const hostname = url.hostname.replace(/^\[|\]$/g, "")
    if (isIP(hostname)) return "client_id must use a domain name"
    if (allowedHosts.length > 0 && !allowedHosts.includes(hostname.toLowerCase())) return `client_id host ${hostname} is not allowed`
    return undefined
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

/** A `lookup` for `https.request` that refuses to resolve to anything but public addresses. */
export const publicOnlyLookup = (hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback): void => {
    dnsLookup(hostname, { all: true }, (error, addresses) => {
        if (error) {
            callback(error, [])
            return
        }
        const blocked = addresses.find(entry => !isPublicAddress(entry.address))
        if (addresses.length === 0 || blocked) {
            const refusal = new Error(`${hostname} resolves to a non public address`) as NodeJS.ErrnoException
            refusal.code = "ECONNREFUSED"
            callback(refusal, [])
            return
        }
        if (typeof options === "object" && options?.all) {
            callback(null, addresses)
        } else {
            callback(null, addresses[0].address, addresses[0].family)
        }
    })
}

export interface FetchClientMetadataOptions {
    timeoutMs?: number
    maxBytes?: number
}

/**
 * GETs the metadata document. No redirects (a 3xx is an error, not a hop to a URL nobody checked),
 * a 5 second budget for the whole exchange and a size cap, as the document is a few hundred bytes of JSON.
 */
export const fetchClientMetadataDocument = (clientId: string, options: FetchClientMetadataOptions = {}): Promise<unknown> => {
    const timeoutMs = options.timeoutMs ?? 5000
    const maxBytes = options.maxBytes ?? 16 * 1024

    return new Promise((resolve, reject) => {
        const request = https.get(
            clientId,
            {
                lookup: publicOnlyLookup as unknown as typeof dnsLookup,
                timeout: timeoutMs,
                headers: { accept: "application/json" }
            },
            response => {
                if (response.statusCode !== 200) {
                    response.resume()
                    reject(new Error(`client metadata document answered ${response.statusCode}`))
                    return
                }
                const chunks: Buffer[] = []
                let size = 0
                response.on("data", (chunk: Buffer) => {
                    size += chunk.length
                    if (size > maxBytes) {
                        request.destroy(new Error("client metadata document is too large"))
                        return
                    }
                    chunks.push(chunk)
                })
                response.on("end", () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
                    } catch {
                        reject(new Error("client metadata document is not JSON"))
                    }
                })
                response.on("error", reject)
            }
        )
        // `timeout` only fires on an idle socket: a server trickling one byte at a time would never
        // trip it. This deadline covers the whole exchange, whatever the pace.
        const deadline = setTimeout(() => request.destroy(new Error("client metadata document timed out")), timeoutMs)
        request.on("close", () => clearTimeout(deadline))
        request.on("timeout", () => request.destroy(new Error("client metadata document timed out")))
        request.on("error", reject)
    })
}
