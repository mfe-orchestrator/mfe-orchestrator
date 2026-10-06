import { describe, expect, it } from "vitest"
import { computeS256Challenge, generateOpaqueToken, hashOpaqueToken, isValidCodeChallenge, verifyPkce } from "./pkce"

/** The example of RFC 7636 Appendix B: an independent expected value, not one computed by the code under test. */
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

describe("PKCE", () => {
    it("given the RFC 7636 verifier, when its S256 challenge is computed, then it is the one the RFC states", () => {
        expect(computeS256Challenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE)
    })

    it("given the verifier matching the challenge, when it is verified, then it passes", () => {
        expect(verifyPkce(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true)
    })

    it("given another well formed verifier, when it is verified, then it fails", () => {
        expect(verifyPkce("a".repeat(43), RFC_CHALLENGE)).toBe(false)
    })

    it.each([
        ["too short", "a".repeat(42)],
        ["too long", "a".repeat(129)],
        ["outside the unreserved set", `${"a".repeat(42)}+`],
        ["not a string", 42]
    ])("given a verifier %s, when it is verified, then it fails", (_case, verifier) => {
        expect(verifyPkce(verifier, RFC_CHALLENGE)).toBe(false)
    })

    it("given the plain method's challenge (the verifier itself), when the verifier is checked against it, then it fails", () => {
        expect(verifyPkce(RFC_VERIFIER, RFC_VERIFIER)).toBe(false)
    })

    it.each([
        [RFC_CHALLENGE, true],
        ["short", false],
        [`${RFC_CHALLENGE}=`, false],
        [undefined, false]
    ])("given the challenge %s, when its shape is checked, then validity is %s", (challenge, valid) => {
        expect(isValidCodeChallenge(challenge)).toBe(valid)
    })
})

describe("opaque tokens", () => {
    it("given two generated tokens, when compared, then they differ and are URL safe", () => {
        const first = generateOpaqueToken()
        const second = generateOpaqueToken()

        expect(first).not.toBe(second)
        expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/)
    })

    it("given a token, when hashed twice, then the hash is stable and is not the token", () => {
        const token = generateOpaqueToken()

        expect(hashOpaqueToken(token)).toBe(hashOpaqueToken(token))
        expect(hashOpaqueToken(token)).not.toContain(token)
    })
})
