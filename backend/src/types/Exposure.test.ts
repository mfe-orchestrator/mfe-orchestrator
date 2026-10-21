import { describe, expect, it } from "vitest"
import { CERTIFICATE_ISSUER, DOMAIN_NAME, exposedHost, isExposurePath, SUBDOMAIN, sameExposurePath } from "./Exposure"

describe("exposedHost", () => {
    it.each([
        ["dev", "dev.example.com"],
        ["dev.eu", "dev.eu.example.com"],
        ["", "example.com"],
        [undefined, "example.com"]
    ])("given the subdomain %j, when the host is made, then it is %s", (subdomain, expected) => {
        expect(exposedHost("example.com", subdomain)).toBe(expected)
    })
})

describe("DOMAIN_NAME", () => {
    it.each(["example.com", "shop.example.co.uk", "a-b.io"])("given %s, when it is checked, then it is a domain", domain => {
        expect(DOMAIN_NAME.test(domain)).toBe(true)
    })

    it.each(["localhost", "Example.com", "-shop.com", "shop..com", "https://example.com", "example.com/"])("given %s, when it is checked, then it is refused", domain => {
        expect(DOMAIN_NAME.test(domain)).toBe(false)
    })
})

describe("SUBDOMAIN", () => {
    it.each(["", "dev", "dev.eu", "a1-b2"])("given %j, when it is checked, then it is a subdomain", subdomain => {
        expect(SUBDOMAIN.test(subdomain)).toBe(true)
    })

    it.each(["dev.", ".dev", "app_1", "DEV", "dev..eu"])("given %j, when it is checked, then it is refused", subdomain => {
        expect(SUBDOMAIN.test(subdomain)).toBe(false)
    })
})

describe("isExposurePath", () => {
    it.each(["/", "/api/orders", "/api/orders/", "/shop/v1.2", "/a~b", "/caf%C3%A9"])("given %s, when it is checked, then an HTTPRoute takes it", path => {
        expect(isExposurePath(path)).toBe(true)
    })

    it.each(["api", "/api?x=1", "/a#b", "/a//b", "/a/./b", "/a/../b", "/..", "/a%2fb", "/a b", "/città", `/${"a".repeat(256)}`])("given %s, when it is checked, then it is refused", path => {
        expect(isExposurePath(path)).toBe(false)
    })
})

describe("sameExposurePath", () => {
    it.each([
        ["/api", "/api/", true],
        ["/", "/", true],
        ["/api", "/apis", false]
    ])("given %s and %s, when they are compared, then the same prefix is %s", (a, b, expected) => {
        expect(sameExposurePath(a, b)).toBe(expected)
    })
})

describe("CERTIFICATE_ISSUER", () => {
    it.each([
        ["letsencrypt", true],
        ["letsencrypt-prod", true],
        ["Lets_Encrypt", false]
    ])("given %s, when it is checked, then it is %s", (issuer, expected) => {
        expect(CERTIFICATE_ISSUER.test(issuer)).toBe(expected)
    })
})
