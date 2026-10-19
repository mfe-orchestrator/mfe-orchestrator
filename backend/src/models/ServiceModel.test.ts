import { Types } from "mongoose"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { transformDocument } from "../utils/encryptedFieldsPlugin"
import { decryptSecret, encryptSecret, isEncryptedSecret, resetSecretEncryptionKeyCache, SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BuiltService from "./BuiltServiceModel"
import Service, { SERVICE_SECRET_PATHS } from "./ServiceModel"

const aService = () => new Service({ projectId: new Types.ObjectId(), slug: "  Orders-API ", name: "Orders API" })

describe("Service model", () => {
    it("given a service with only the required fields, when it is built, then port, probes and env take their defaults and it has no API docs", async () => {
        const service = aService()

        expect(service.port).toBe(8080)
        expect(service.livenessPath).toBe("/health/live")
        expect(service.readinessPath).toBe("/health/ready")
        expect(service.docsPath).toBeUndefined()
        expect(service.openApiPath).toBeUndefined()
        expect(service.env).toEqual([])
        await expect(service.validate()).resolves.toBeUndefined()
    })

    it("given every path of a Spring Boot service, when it is validated, then it is accepted", async () => {
        const service = new Service({
            projectId: new Types.ObjectId(),
            slug: "orders",
            name: "Orders",
            livenessPath: "/actuator/health/liveness",
            readinessPath: "/actuator/health/readiness",
            docsPath: "/swagger-ui.html",
            openApiPath: "/v3/api-docs"
        })

        await expect(service.validate()).resolves.toBeUndefined()
    })

    it("given blank docs and OpenAPI paths, when it is built, then the service has none", () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", docsPath: "  ", openApiPath: "" })

        expect(service.docsPath).toBeNull()
        expect(service.openApiPath).toBeNull()
    })

    it.each([
        ["livenessPath", "health/live"],
        ["livenessPath", ""],
        ["readinessPath", "/health ready"],
        ["readinessPath", `/${"x".repeat(256)}`],
        ["docsPath", "docs"],
        ["docsPath", "/my\tdocs"],
        ["openApiPath", "https://example.com/openapi.json"]
    ])("given the %s %j, when it is validated, then it is refused", async (field, value) => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", [field]: value })

        await expect(service.validate()).rejects.toMatchObject({ errors: { [field]: expect.anything() } })
    })

    it("given a path of 256 characters, when it is validated, then it is accepted", async () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", livenessPath: `/${"x".repeat(255)}` })

        await expect(service.validate()).resolves.toBeUndefined()
    })

    it("given a slug with capitals and spaces, when it is built, then it is stored trimmed and lowercase", () => {
        expect(aService().slug).toBe("orders-api")
    })

    it("given an env variable with only a name, when it is built, then it is neither required nor secret", () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", env: [{ name: "DATABASE_URL" }] })

        expect(service.env[0]).toMatchObject({ name: "DATABASE_URL", required: false, secret: false })
    })

    it("given no project, when it is validated, then it is refused", async () => {
        const service = new Service({ slug: "orders", name: "Orders" })

        await expect(service.validate()).rejects.toMatchObject({ errors: { projectId: expect.anything() } })
    })

    it("given a service with no variables, when it is built, then its config map and secrets are empty", () => {
        expect(aService().configMap).toEqual([])
        expect(aService().secrets).toEqual([])
    })

    it("given a service with no base URL, when it is built, then it is exposed nowhere; given one without environment, then it is refused", async () => {
        expect(aService().urls).toEqual([])

        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", urls: [{ url: "https://orders.acme.com" }] })
        await expect(service.validate()).rejects.toMatchObject({ errors: { "urls.0.environmentId": expect.anything() } })
    })

    it("given a base URL that is not http(s), when it is validated, then it is refused even without going through ServiceService", async () => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", urls: [{ environmentId: new Types.ObjectId(), url: "javascript:alert(1)" }] })

        await expect(service.validate()).rejects.toMatchObject({ errors: { "urls.0.url": expect.anything() } })
    })

    it.each([["configMap"], ["secrets"]])("given a %s key starting with a digit, when it is validated, then it is refused", async field => {
        const service = new Service({ projectId: new Types.ObjectId(), slug: "orders", name: "Orders", [field]: [{ key: "1_URL", values: [] }] })

        await expect(service.validate()).rejects.toMatchObject({ errors: { [`${field}.0.key`]: expect.anything() } })
    })

    it("given a service with a config map and secrets, when it is serialised, then the config map is sent and every secret value is the placeholder", () => {
        const environmentId = new Types.ObjectId()
        const service = new Service({
            projectId: new Types.ObjectId(),
            slug: "orders",
            name: "Orders",
            configMap: [{ key: "LOG_LEVEL", values: [{ environmentId, value: "debug" }] }],
            secrets: [{ key: "DATABASE_PASSWORD", values: [{ environmentId, value: "hunter2" }] }]
        })

        const json = JSON.parse(JSON.stringify(service))

        expect(json.configMap).toEqual([{ key: "LOG_LEVEL", values: [{ environmentId: String(environmentId), value: "debug" }] }])
        expect(json.secrets).toEqual([{ key: "DATABASE_PASSWORD", values: [{ environmentId: String(environmentId), value: SECRET_PLACEHOLDER }] }])
        expect(service.secrets[0].values[0].value).toBe("hunter2")
    })

    describe("with a key configured", () => {
        const originalKey = process.env.SECRETS_ENCRYPTION_KEY

        beforeEach(() => {
            process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64")
            resetSecretEncryptionKeyCache()
        })

        afterEach(() => {
            if (originalKey === undefined) delete process.env.SECRETS_ENCRYPTION_KEY
            else process.env.SECRETS_ENCRYPTION_KEY = originalKey
            resetSecretEncryptionKeyCache()
        })

        it("given secrets in two environments, when they are encrypted and decrypted, then every value goes through it and the config map does not", () => {
            const options = { model: "Service", paths: SERVICE_SECRET_PATHS }
            const service = new Service({
                projectId: new Types.ObjectId(),
                slug: "orders",
                name: "Orders",
                configMap: [{ key: "LOG_LEVEL", values: [{ environmentId: new Types.ObjectId(), value: "debug" }] }],
                secrets: [
                    {
                        key: "API_TOKEN",
                        values: [
                            { environmentId: new Types.ObjectId(), value: "dev-token" },
                            { environmentId: new Types.ObjectId(), value: "prod-token" }
                        ]
                    }
                ]
            })

            transformDocument(service, options, encryptSecret)

            expect(service.secrets[0].values.every(({ value }) => isEncryptedSecret(value))).toBe(true)
            expect(service.configMap[0].values[0].value).toBe("debug")

            transformDocument(service, options, decryptSecret)

            expect(service.secrets[0].values.map(({ value }) => value)).toEqual(["dev-token", "prod-token"])
        })
    })

    it("declares the slug unique inside its project", () => {
        expect(Service.schema.indexes()).toContainEqual([{ slug: 1, projectId: 1 }, expect.objectContaining({ unique: true })])
    })
})

describe("BuiltService model", () => {
    it("declares one entry per version of a service", () => {
        expect(BuiltService.schema.indexes()).toContainEqual([{ serviceId: 1, version: 1 }, expect.objectContaining({ unique: true })])
    })

    it("given no image, when it is validated, then it is refused", async () => {
        const built = new BuiltService({ serviceId: new Types.ObjectId(), version: "1.0.0" })

        await expect(built.validate()).rejects.toMatchObject({ errors: { image: expect.anything() } })
    })
})
