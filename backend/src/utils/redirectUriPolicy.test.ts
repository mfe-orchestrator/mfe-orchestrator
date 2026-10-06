import { describe, expect, it } from "vitest"
import { describeRedirectHost, matchesRegisteredRedirectUri, redirectUriWarnings, validateRedirectUri } from "./redirectUriPolicy"

describe("validateRedirectUri", () => {
    it.each([
        "https://claude.ai/api/mcp/auth_callback",
        "http://localhost:33418/callback",
        "http://127.0.0.1/callback",
        "http://[::1]:8080/cb",
        "cursor://anysphere.cursor-retrieval/oauth/callback",
        "vscode://vscode.github-authentication/did-authenticate"
    ])("given %s, when it is validated, then it can be registered", uri => {
        expect(validateRedirectUri(uri)).toBeUndefined()
    })

    it.each([
        ["plain http on a real host", "http://example.com/callback"],
        ["a fragment", "https://example.com/callback#token"],
        ["credentials", "https://user:secret@example.com/callback"],
        ["a script URI", "javascript:alert(1)"],
        ["a data URI", "data:text/html,hi"],
        ["a file URI", "file:///etc/passwd"],
        ["a relative path", "/callback"],
        ["an empty string", ""]
    ])("given a redirect URI with %s, when it is validated, then it is refused", (_case, uri) => {
        expect(validateRedirectUri(uri)).toBeDefined()
    })

    it("given something that is not a string, when it is validated, then it is refused", () => {
        expect(validateRedirectUri(42)).toBeDefined()
    })
})

describe("matchesRegisteredRedirectUri", () => {
    it("given the exact registered URI, when matched, then it matches", () => {
        expect(matchesRegisteredRedirectUri("https://app.example.com/cb", ["https://app.example.com/cb"])).toBe(true)
    })

    it("given a URI differing by a trailing slash, when matched, then it does not match", () => {
        expect(matchesRegisteredRedirectUri("https://app.example.com/cb/", ["https://app.example.com/cb"])).toBe(false)
    })

    it("given an https URI on another port, when matched, then it does not match", () => {
        expect(matchesRegisteredRedirectUri("https://app.example.com:8443/cb", ["https://app.example.com/cb"])).toBe(false)
    })

    it("given a loopback URI on another port, when matched, then it matches (RFC 8252 ephemeral ports)", () => {
        expect(matchesRegisteredRedirectUri("http://127.0.0.1:51234/callback", ["http://127.0.0.1:3000/callback"])).toBe(true)
    })

    it("given a loopback URI on another path, when matched, then it does not match", () => {
        expect(matchesRegisteredRedirectUri("http://127.0.0.1:51234/other", ["http://127.0.0.1:3000/callback"])).toBe(false)
    })

    it("given a loopback URI on another loopback host, when matched, then it does not match", () => {
        expect(matchesRegisteredRedirectUri("http://localhost:51234/callback", ["http://127.0.0.1:3000/callback"])).toBe(false)
    })
})

describe("what the consent page shows", () => {
    it("given an https redirect, when described, then the host is shown and nothing is flagged", () => {
        expect(describeRedirectHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai")
        expect(redirectUriWarnings("https://claude.ai/api/mcp/auth_callback")).toEqual([])
    })

    it("given a loopback redirect, when described, then it is flagged as localhost", () => {
        expect(describeRedirectHost("http://localhost:33418/callback")).toBe("localhost:33418")
        expect(redirectUriWarnings("http://localhost:33418/callback")).toEqual(["localhost"])
    })

    it("given a private-use scheme, when described, then the scheme is shown and flagged", () => {
        expect(describeRedirectHost("cursor://anysphere.cursor-retrieval/oauth/callback")).toBe("cursor://anysphere.cursor-retrieval")
        expect(redirectUriWarnings("cursor://anysphere.cursor-retrieval/oauth/callback")).toEqual(["custom_scheme"])
    })
})
