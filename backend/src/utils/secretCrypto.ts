import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * Application level encryption for the credentials the console keeps on behalf of a project: bucket
 * keys, storage connection strings, service account files, repository tokens.
 *
 * What it buys, precisely: whoever reads the database — a dump, a backup, a hosted Mongo the operator
 * does not own — sees ciphertext instead of a usable credential. It does not protect against somebody
 * who controls the process, because the backend has to decrypt those values to talk to S3 or to
 * GitHub during an unattended deploy, so the key is necessarily within reach of anybody holding the
 * environment. Narrowing that further means moving the key into a KMS, where the decrypt is a remote
 * authenticated call that can be audited and revoked; the `v1` marker in the format is what will let
 * that scheme land beside this one without rewriting the stored values.
 *
 * With no key configured everything is a pass-through, so an existing installation keeps working and
 * opting in is setting one variable. Values written before the key existed stay readable — they carry
 * no marker and are handed back untouched — and are converted by the migration at boot.
 */

const ALGORITHM = "aes-256-gcm"

/** Marks a value as encrypted, and by which scheme. Anything without it is a plaintext leftover. */
const PREFIX = "enc:v1:"

const IV_BYTES = 12
const KEY_BYTES = 32

/**
 * What the API sends in place of a secret it will not disclose. Writing it back means "keep the one
 * you already have": the edit forms submit every field, including the ones the user never saw.
 */
export const SECRET_PLACEHOLDER = "••••••••••••"

export class SecretEncryptionError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "SecretEncryptionError"
    }
}

/** `undefined` while unresolved, `null` once resolved to "no key configured". */
let cachedKey: Buffer | null | undefined

/** Only for tests: the key is read once and cached for the life of the process. */
export const resetSecretEncryptionKeyCache = (): void => {
    cachedKey = undefined
}

const parseKey = (raw: string): Buffer => {
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64")

    if (key.length !== KEY_BYTES) {
        throw new SecretEncryptionError(
            `SECRETS_ENCRYPTION_KEY must hold ${KEY_BYTES} bytes, as base64 or as ${KEY_BYTES * 2} hex characters, but it decodes to ${key.length}. Generate one with: openssl rand -base64 32`
        )
    }

    return key
}

const getKey = (): Buffer | null => {
    if (cachedKey === undefined) {
        const raw = process.env.SECRETS_ENCRYPTION_KEY?.trim()
        cachedKey = raw ? parseKey(raw) : null
    }

    return cachedKey
}

/** True when a key is configured. Throws when one is configured but unusable. */
export const isSecretEncryptionEnabled = (): boolean => getKey() !== null

export const isEncryptedSecret = (value: unknown): value is string => typeof value === "string" && value.startsWith(PREFIX)

/**
 * The ciphertext of `value`, or `value` itself when there is nothing to do: a non-string, an empty
 * string, something already encrypted, or no key configured.
 *
 * `context` is authenticated but not encrypted, and names the model and the field the value belongs
 * to, so a ciphertext lifted out of one column and pasted into another fails to decrypt instead of
 * silently authenticating as a credential it never was.
 */
export const encryptSecret = (value: unknown, context: string): unknown => {
    if (typeof value !== "string" || value.length === 0) return value
    if (isEncryptedSecret(value)) return value

    const key = getKey()
    if (!key) return value

    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    cipher.setAAD(Buffer.from(context, "utf8"))

    const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])

    return PREFIX + [iv.toString("base64"), cipher.getAuthTag().toString("base64"), payload.toString("base64")].join(":")
}

/**
 * The plaintext behind `value`. Anything not carrying the marker is returned as it is: that is both
 * the pass-through for non-secret fields and the compatibility path for values written before the
 * key was introduced.
 */
export const decryptSecret = (value: unknown, context: string): unknown => {
    if (!isEncryptedSecret(value)) return value

    const key = getKey()
    if (!key) {
        throw new SecretEncryptionError("The database holds encrypted secrets but SECRETS_ENCRYPTION_KEY is not set. Without the key that wrote them they cannot be read back.")
    }

    const [iv, tag, payload] = value.slice(PREFIX.length).split(":")
    if (!iv || !tag || !payload) {
        throw new SecretEncryptionError(`Malformed encrypted value for ${context}`)
    }

    try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, "base64"))
        decipher.setAAD(Buffer.from(context, "utf8"))
        decipher.setAuthTag(Buffer.from(tag, "base64"))

        return Buffer.concat([decipher.update(Buffer.from(payload, "base64")), decipher.final()]).toString("utf8")
    } catch {
        // The tag check is the only thing that fails here, and it cannot tell the two causes apart:
        // either the key is not the one that wrote the value, or the stored bytes were altered.
        throw new SecretEncryptionError(`Cannot decrypt ${context}: SECRETS_ENCRYPTION_KEY does not match the one that wrote the value, or the value was tampered with.`)
    }
}

/**
 * Rejects a misconfigured key at boot, before anything depends on it. A key that decodes to the wrong
 * length would otherwise let the process start and then fail on the first credential it touches, which
 * reads as a broken storage rather than as a typo in the environment.
 */
export const assertSecretEncryptionKeyIsUsable = (): void => {
    getKey()
}
