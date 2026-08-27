import { Schema } from "mongoose"
import { decryptSecret, encryptSecret } from "./secretCrypto"

/**
 * Keeps a set of fields encrypted in the database and plaintext everywhere else, so no service and no
 * client of a model has to know that the value on disk is not the value in memory.
 *
 * Documents are encrypted on the way out (`save`, `insertMany`, and the `$set` of an update) and
 * decrypted on the way back in (`init`, and the document a `save` resolves with, which callers keep
 * using right after). See secretCrypto.ts for what this protects against and what it does not.
 */

export interface EncryptedFieldsOptions {
    /**
     * Name of the model, authenticated together with the ciphertext. Two models sharing a path name
     * must not share a context, otherwise a ciphertext could be moved from one to the other.
     */
    model: string
    /**
     * Dotted paths of the values to protect. A segment resolving to an array applies the rest of the
     * path to every element, which is how the credentials inside a deployment snapshot are reached.
     */
    paths: string[]
}

type Transform = (value: unknown, context: string) => unknown

const isTraversable = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object"

/** The associated data of a path: what the ciphertext is bound to, and never the array index. */
const contextOf = (options: EncryptedFieldsOptions, path: string): string => `${options.model}:${path}`

/**
 * Applies `transform` to whatever `segments` resolves to inside `container`, and reports whether
 * anything changed — the caller needs to know to mark a Mixed path as modified.
 */
const transformPath = (container: unknown, segments: string[], context: string, transform: Transform): boolean => {
    if (!isTraversable(container)) return false

    if (Array.isArray(container)) {
        return container.reduce<boolean>((changed, element) => transformPath(element, segments, context, transform) || changed, false)
    }

    const [head, ...rest] = segments
    if (rest.length > 0) return transformPath(container[head], rest, context, transform)

    const current = container[head]
    const next = transform(current, context)
    if (next === current) return false

    container[head] = next
    return true
}

/**
 * A document, in place. Mongoose does not watch inside a Mixed subdocument, so a nested path has to be
 * marked by hand or the change is dropped on save.
 */
export const transformDocument = (document: unknown, options: EncryptedFieldsOptions, transform: Transform): void => {
    if (!isTraversable(document)) return

    for (const path of options.paths) {
        const segments = path.split(".")
        const changed = transformPath(document, segments, contextOf(options, path), transform)

        if (changed && segments.length > 1 && typeof (document as { markModified?: unknown }).markModified === "function") {
            ;(document as { markModified: (path: string) => void }).markModified(segments[0])
        }
    }
}

/**
 * The payload of an update. A path can arrive either spelled out as a dotted key — `{"authConfig.jsonKey": x}` —
 * or nested inside the object the caller replaced the whole field with, and both forms have to be caught.
 */
export const transformUpdate = (update: unknown, options: EncryptedFieldsOptions, transform: Transform): void => {
    if (!isTraversable(update) || Array.isArray(update)) return

    const targets = [update, update.$set, update.$setOnInsert].filter((target): target is Record<string, unknown> => isTraversable(target) && !Array.isArray(target))

    for (const path of options.paths) {
        const context = contextOf(options, path)

        for (const target of targets) {
            if (Object.hasOwn(target, path)) {
                target[path] = transform(target[path], context)
            } else {
                transformPath(target, path.split("."), context, transform)
            }
        }
    }
}

/** insertMany takes one document or many, and hands the hook back whatever it was given. */
const asList = (documents: unknown): unknown[] => (Array.isArray(documents) ? documents : [documents])

export const encryptedFields = (schema: Schema, options: EncryptedFieldsOptions): void => {
    schema.pre("save", function () {
        transformDocument(this, options, encryptSecret)
    })

    // The caller goes on using the document it saved — a repository is saved and then used to call
    // GitHub with its token — so what it holds has to be the credential again, not the ciphertext.
    schema.post("save", function (document) {
        transformDocument(document, options, decryptSecret)
    })

    schema.post("init", function (document) {
        transformDocument(document, options, decryptSecret)
    })

    schema.pre(["findOneAndUpdate", "updateOne", "updateMany"], function () {
        transformUpdate(this.getUpdate(), options, encryptSecret)
    })

    // insertMany skips document middleware entirely: without these two, a bulk insert would write
    // every credential in the clear.
    schema.pre("insertMany", function (documents: unknown) {
        for (const document of asList(documents)) transformDocument(document, options, encryptSecret)
    })

    schema.post("insertMany", function (documents: unknown) {
        for (const document of asList(documents)) transformDocument(document, options, decryptSecret)
    })
}
