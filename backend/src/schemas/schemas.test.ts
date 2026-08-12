import Fastify, { FastifyInstance } from "fastify"
import { describe, expect, test } from "vitest"
import * as apiKeySchemas from "./apiKey.schema"
import * as codeRepositorySchemas from "./codeRepository.schema"
import * as deploymentSchemas from "./deployment.schema"
import * as environmentSchemas from "./environment.schema"
import * as globalVariablesSchemas from "./globalVariables.schema"
import * as microfrontendSchemas from "./microfrontend.schema"
import * as microfrontendDependencySchemas from "./microfrontendDependency.schema"
import * as miscSchemas from "./misc.schema"
import * as projectSchemas from "./project.schema"
import * as projectUserSchemas from "./projectUser.schema"
import * as serveSchemas from "./serve.schema"
import * as startupSchemas from "./startup.schema"
import * as storageSchemas from "./storage.schema"
import * as userSchemas from "./user.schema"

type RouteSchema = { body?: unknown; params?: unknown; querystring?: unknown }

const modules: Record<string, Record<string, RouteSchema>> = {
    apiKey: apiKeySchemas,
    codeRepository: codeRepositorySchemas,
    deployment: deploymentSchemas,
    environment: environmentSchemas,
    globalVariables: globalVariablesSchemas,
    microfrontend: microfrontendSchemas,
    microfrontendDependency: microfrontendDependencySchemas,
    misc: miscSchemas,
    project: projectSchemas,
    projectUser: projectUserSchemas,
    serve: serveSchemas,
    startup: startupSchemas,
    storage: storageSchemas,
    user: userSchemas
}

/**
 * Every exported schema has to compile. A malformed one is not caught by the
 * type checker — it is a plain object — and would otherwise only surface when the
 * route it belongs to is registered at boot.
 */
describe("every route schema compiles", () => {
    for (const [moduleName, exported] of Object.entries(modules)) {
        for (const [schemaName, schema] of Object.entries(exported)) {
            test(`${moduleName}.${schemaName}`, async () => {
                const app = Fastify({ logger: false })
                // The params schema of a wildcard route declares "*", so the probe route
                // has to carry the same segments the real one does.
                const hasWildcard = JSON.stringify(schema.params ?? {}).includes('"*"')
                app.post(hasWildcard ? "/probe/*" : "/probe", { schema }, async () => ({ ok: true }))
                await expect(app.ready()).resolves.toBeTruthy()
                await app.close()
            })
        }
    }
})

const buildApp = async (schema: RouteSchema): Promise<FastifyInstance> => {
    const app = Fastify({ logger: false })
    app.post("/probe", { schema }, async request => ({ body: request.body }))
    await app.ready()
    return app
}

/** Probes the body alone: the probe route has no path parameters to satisfy. */
const post = async (schema: RouteSchema, payload: unknown) => {
    const app = await buildApp({ body: schema.body })
    const response = await app.inject({ method: "POST", url: "/probe", payload: payload as never })
    await app.close()
    return response
}

/**
 * The reason the schemas exist. A body field that reaches a mongo filter has to be
 * a scalar; an object in that position is a query operator, and before the schemas
 * it travelled all the way into `findOne`.
 */
describe("a query operator never reaches a handler", () => {
    const operators = [{ $ne: null }, { $gt: "" }, { $regex: ".*" }, { $exists: true }]

    test.each(operators)("reset password rejects a token of %j", async operator => {
        const response = await post(userSchemas.resetPasswordSchema, { token: operator, password: "abcdefgh" })
        expect(response.statusCode).toBe(400)
    })

    test.each(operators)("account activation rejects a token of %j", async operator => {
        const response = await post(userSchemas.accountActivationSchema, { token: operator })
        expect(response.statusCode).toBe(400)
    })

    test.each(operators)("login rejects an email of %j", async operator => {
        const response = await post(userSchemas.loginSchema, { email: operator, password: "whatever" })
        expect(response.statusCode).toBe(400)
    })

    test.each(operators)("forgot password rejects an email of %j", async operator => {
        const response = await post(userSchemas.forgotPasswordSchema, { email: operator })
        expect(response.statusCode).toBe(400)
    })

    test("a legitimate reset still goes through", async () => {
        const response = await post(userSchemas.resetPasswordSchema, { token: "5b1f3c0e9a", password: "abcdefgh" })
        expect(response.statusCode).toBe(200)
        expect(response.json().body).toEqual({ token: "5b1f3c0e9a", password: "abcdefgh" })
    })
})

/**
 * Several services spread the request body into the update document they hand to
 * `findByIdAndUpdate`. A key starting with `$` would be read by mongo as an update
 * operator rather than as a field, so it must not survive validation.
 */
describe("an update operator never reaches an update document", () => {
    const cases: Array<[string, RouteSchema, Record<string, unknown>]> = [
        ["project", projectSchemas.updateProjectSchema, { name: "kept" }],
        ["environment", environmentSchemas.updateEnvironmentSchema, { name: "kept", slug: "kept" }],
        ["microfrontend", microfrontendSchemas.updateMicrofrontendSchema, { slug: "kept", name: "kept" }],
        ["storage", storageSchemas.updateStorageSchema, { name: "kept", type: "AWS" }]
    ]

    test.each(cases)("%s update drops $set and $unset", async (_name, schema, valid) => {
        const response = await post(schema, { ...valid, $set: { role: "admin" }, $unset: { name: 1 } })
        expect(response.statusCode).toBe(200)
        expect(response.json().body).toEqual(valid)
    })
})

describe("public account endpoints only accept the fields they declare", () => {
    test("registration drops a role and a status it was never meant to take", async () => {
        const response = await post(userSchemas.registrationSchema, {
            email: "someone@example.com",
            password: "abcdefgh",
            role: "admin",
            status: "ACTIVE",
            isInvited: false
        })
        expect(response.statusCode).toBe(200)
        expect(response.json().body).toEqual({ email: "someone@example.com", password: "abcdefgh" })
    })

    test("registration rejects a password below the stored minimum", async () => {
        const response = await post(userSchemas.registrationSchema, { email: "someone@example.com", password: "short" })
        expect(response.statusCode).toBe(400)
    })

    test("registration rejects something that is not an email", async () => {
        const response = await post(userSchemas.registrationSchema, { email: "not-an-email" })
        expect(response.statusCode).toBe(400)
    })

    test("the theme is bounded to the enum the model declares", async () => {
        expect((await post(userSchemas.themeSchema, { theme: "DARK" })).statusCode).toBe(200)
        expect((await post(userSchemas.themeSchema, { theme: "NEON" })).statusCode).toBe(400)
    })
})

/**
 * Not every id is an ObjectId, and pinning one that is not would break the feature
 * instead of protecting it. A canary user is identified by whatever the host
 * application calls its users.
 */
describe("canary user ids stay free-form strings", () => {
    test("an identifier from the host application is accepted", async () => {
        const response = await post(deploymentSchemas.setCanaryUsersSchema, { userIds: ["auth0|abc123", "user-42"], enabled: true })
        expect(response.statusCode).toBe(200)
        expect(response.json().body.userIds).toEqual(["auth0|abc123", "user-42"])
    })

    test("an operator among them is still rejected, because they end up in a $in", async () => {
        const response = await post(deploymentSchemas.setCanaryUsersSchema, { userIds: [{ $ne: null }], enabled: true })
        expect(response.statusCode).toBe(400)
    })
})

describe("identifiers in the path are shaped like identifiers", () => {
    const withParams = async (schema: RouteSchema, url: string) => {
        const app = Fastify({ logger: false })
        app.get("/probe/:projectId", { schema }, async () => ({ ok: true }))
        await app.ready()
        const response = await app.inject({ method: "GET", url })
        await app.close()
        return response
    }

    test("an ObjectId is accepted", async () => {
        expect((await withParams(projectSchemas.projectIdSchema, "/probe/507f1f77bcf86cd799439011")).statusCode).toBe(200)
    })

    test("anything else is a 400, not a cast error deeper down", async () => {
        expect((await withParams(projectSchemas.projectIdSchema, "/probe/not-an-id")).statusCode).toBe(400)
    })
})

/**
 * The upload path segments become directory names. Bounding them is a narrowing,
 * not the containment check itself, but it removes the way a version reached the
 * `path.join` that builds the destination with `..` in it.
 *
 * A literal `..` never gets that far anyway — the router normalises the path
 * before matching — but a percent-encoded one does: the segments are split on the
 * raw slashes first and each parameter is decoded afterwards, so `..%2F..` arrives
 * at the handler as `../..` inside a single parameter. That is the form the
 * pattern has to catch.
 */
describe("the upload version cannot be a traversal", () => {
    const inject = async (version: string) => {
        const app = Fastify({ logger: false })
        app.post("/upload/:microfrontendSlug/:version", { schema: microfrontendSchemas.uploadMicrofrontendSchema }, async request => request.params)
        await app.ready()
        const response = await app.inject({ method: "POST", url: `/upload/checkout/${version}` })
        await app.close()
        return response
    }

    test("a semver version is accepted", async () => {
        expect((await inject("1.4.2")).statusCode).toBe(200)
    })

    test.each(["..%2F..%2Fetc", "%2e%2e%2f%2e%2e", "..%2F..%2F..%2Ftmp%2Fevil"])("the encoded traversal %s is rejected", async version => {
        expect((await inject(version)).statusCode).toBe(400)
    })

    test("a literal .. is normalised away by the router and never matches the route", async () => {
        expect((await inject("..")).statusCode).toBe(404)
    })
})
