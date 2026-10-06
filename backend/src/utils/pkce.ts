import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

/**
 * RFC 7636: the verifier is 43 to 128 characters of the unreserved set. Anything else is refused
 * before hashing, so a client sending a short or malformed verifier learns that, instead of
 * learning that it simply did not match.
 */
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/

/** A S256 challenge is the base64url of a SHA-256: always 43 characters, no padding. */
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9\-_]{43}$/

export const isValidCodeChallenge = (challenge: unknown): challenge is string => typeof challenge === "string" && CODE_CHALLENGE_PATTERN.test(challenge)

export const computeS256Challenge = (verifier: string): string => createHash("sha256").update(verifier, "ascii").digest("base64url")

/**
 * Whether the verifier presented at the token endpoint proves possession of the challenge sent to
 * the authorization endpoint. S256 only: `plain` would let whoever intercepts the authorization
 * request redeem the code too, which is the attack PKCE exists to stop.
 */
export const verifyPkce = (verifier: unknown, challenge: string): boolean => {
    if (typeof verifier !== "string" || !CODE_VERIFIER_PATTERN.test(verifier)) {
        return false
    }
    const expected = Buffer.from(challenge)
    const actual = Buffer.from(computeS256Challenge(verifier))
    return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/** 256 random bits, URL safe: the shape of every handle, code and refresh token issued here. */
export const generateOpaqueToken = (): string => randomBytes(32).toString("base64url")

/**
 * What is stored in place of an opaque token. These tokens carry 256 random bits, so a plain
 * SHA-256 is enough: there is nothing to brute force, and a lookup by hash stays an index hit.
 */
export const hashOpaqueToken = (token: string): string => createHash("sha256").update(token).digest("hex")
