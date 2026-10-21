import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { transformDocument, transformUpdate } from "../utils/encryptedFieldsPlugin"
import { decryptSecret, encryptSecret, isEncryptedSecret, resetSecretEncryptionKeyCache } from "../utils/secretCrypto"
import { PROJECT_SECRET_PATHS } from "./ProjectModel"

const originalKey = process.env.SECRETS_ENCRYPTION_KEY

beforeEach(() => {
    process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64")
    resetSecretEncryptionKeyCache()
})

afterEach(() => {
    if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY
    else process.env.SECRETS_ENCRYPTION_KEY = originalKey
    resetSecretEncryptionKeyCache()
})

const PROJECT = { model: "Project", paths: PROJECT_SECRET_PATHS }

const argoCd = () => ({
    url: "https://argocd.example.com",
    token: "argo-token",
    repositories: {
        configuration: { source: "deployToken", username: "gitlab+deploy-token-8", password: "gldt-new", repoUrl: "https://gitlab.example.com/acme/shop-config.git" },
        applications: { source: "manual", username: "x-access-token", password: "ghp-read-only", repoUrl: "https://github.com/acme/shop-apps.git" }
    }
})

describe("Project encrypted fields", () => {
    it("given the Argo CD object set whole by an update, when it is encrypted, then the token and both repository passwords are ciphertext and the rest is not", () => {
        const update = { $set: { argoCd: argoCd() } }

        transformUpdate(update, PROJECT, encryptSecret)

        const { token, url, repositories } = update.$set.argoCd
        expect(isEncryptedSecret(token)).toBe(true)
        expect(isEncryptedSecret(repositories.configuration.password)).toBe(true)
        expect(isEncryptedSecret(repositories.applications.password)).toBe(true)
        expect(url).toBe("https://argocd.example.com")
        expect(repositories.configuration.username).toBe("gitlab+deploy-token-8")
    })

    it("given an encrypted project, when it is read back, then the credentials come back in plaintext", () => {
        const document = { argoCd: argoCd() }

        transformDocument(document, PROJECT, encryptSecret)
        transformDocument(document, PROJECT, decryptSecret)

        expect(document.argoCd).toEqual(argoCd())
    })
})
