import fs from "fs"
import path from "path"
import { describe, expect, test } from "vitest"
import * as apiKey from "./apiKey.schema"
import * as codeRepository from "./codeRepository.schema"
import * as deployment from "./deployment.schema"
import * as environment from "./environment.schema"
import * as globalVariables from "./globalVariables.schema"
import * as microfrontend from "./microfrontend.schema"
import * as microfrontendDependency from "./microfrontendDependency.schema"
import * as misc from "./misc.schema"
import * as project from "./project.schema"
import * as projectUser from "./projectUser.schema"
import * as serve from "./serve.schema"
import * as startup from "./startup.schema"
import * as storage from "./storage.schema"
import * as user from "./user.schema"

/**
 * Guards the property that makes the schemas worth having: that they are actually
 * attached, to every route that takes input, and that a params schema covers
 * exactly the parameters its route declares.
 *
 * The second half matters as much as the first. `additionalProperties: false`
 * combined with the Fastify default `removeAdditional` means a params schema that
 * forgets a parameter does not fail — it deletes it, and the handler reads
 * `undefined` from `request.params`. That is a silent breakage a type checker
 * cannot see, so it is asserted here instead.
 */

type RouteSchema = { body?: unknown; params?: { properties?: Record<string, unknown> }; querystring?: unknown }

const SCHEMA_MODULES: Record<string, Record<string, RouteSchema>> = {
    "apiKey.schema": apiKey,
    "codeRepository.schema": codeRepository,
    "deployment.schema": deployment,
    "environment.schema": environment,
    "globalVariables.schema": globalVariables,
    "microfrontend.schema": microfrontend,
    "microfrontendDependency.schema": microfrontendDependency,
    "misc.schema": misc,
    "project.schema": project,
    "projectUser.schema": projectUser,
    "serve.schema": serve,
    "startup.schema": startup,
    "storage.schema": storage,
    "user.schema": user
}

/**
 * Routes that legitimately declare no schema: they take no path parameter, no body
 * and no query string, reading everything they need from the headers or from the
 * authenticated user. Adding a route here is a deliberate statement that it has no
 * input to validate.
 */
const ROUTES_WITHOUT_INPUT = new Set([
    "/configuration",
    "/echo",
    "/environments",
    "/global-variables",
    "/integration/module-federation/plan",
    "/market",
    "/microfrontends",
    "/microfrontends/stack-detection",
    "/dependencies/targets",
    "/dependencies",
    "/projects/mine",
    "/users/me/invitations",
    "/users/me/projects",
    "/startup/users/exists",
    "/telemetry/status",
    "/users/profile"
])

interface DeclaredRoute {
    file: string
    route: string
    schemaName?: string
    pathParams: string[]
}

/**
 * Reads the route table out of the controller sources.
 *
 * The alternative — booting the app and listening on `onRoute` — would drag in the
 * database, the mailer and the config plugin for a check that is about what the
 * source says.
 */
const readRoutes = (): DeclaredRoute[] => {
    const directory = path.resolve(__dirname, "..", "controller")
    const routes: DeclaredRoute[] = []

    for (const file of fs.readdirSync(directory).filter(name => name.endsWith(".ts"))) {
        const source = fs.readFileSync(path.join(directory, file), "utf8")

        for (const match of source.matchAll(/fastify\.(get|post|put|delete|patch)/g)) {
            let i = match.index + match[0].length
            const skipSpace = () => {
                while (i < source.length && /\s/.test(source[i])) i++
            }
            const skipBalanced = (open: string, close: string) => {
                let depth = 0
                while (i < source.length) {
                    if (source[i] === open) depth++
                    else if (source[i] === close) {
                        depth--
                        if (depth === 0) {
                            i++
                            return
                        }
                    }
                    i++
                }
            }

            skipSpace()
            if (source[i] === "<") skipBalanced("<", ">")
            skipSpace()
            if (source[i] !== "(") continue
            i++
            skipSpace()
            const quote = source[i]
            if (quote !== '"' && quote !== "`") continue
            i++
            const start = i
            while (i < source.length && source[i] !== quote) i++
            const route = source.slice(start, i)
            i++

            while (i < source.length && /[\s,]/.test(source[i])) i++
            let options = ""
            if (source[i] === "{") {
                const optionsStart = i
                skipBalanced("{", "}")
                options = source.slice(optionsStart, i)
            }

            const pathParams = [...new Set([...route.matchAll(/:([A-Za-z0-9_]+)/g)].map(m => m[1]))]
            if (route.includes("*")) pathParams.push("*")

            routes.push({
                file,
                route,
                schemaName: /schema:\s*([A-Za-z0-9_]+)/.exec(options)?.[1],
                pathParams
            })
        }
    }

    return routes
}

const routes = readRoutes()

const findSchema = (name: string): RouteSchema | undefined => {
    for (const exported of Object.values(SCHEMA_MODULES)) {
        if (name in exported) return exported[name]
    }
    return undefined
}

test("the controllers were parsed at all", () => {
    expect(routes.length).toBeGreaterThan(100)
})

/**
 * A name exported by two modules would make an import ambiguous to a reader and
 * lets a controller pick up the wrong one — two schemas called
 * `environmentIdSchema` did exactly that, one keyed on `id` and one on
 * `environmentId`.
 */
test("no schema name is exported by two modules", () => {
    const seen = new Map<string, string>()
    const collisions: string[] = []
    for (const [moduleName, exported] of Object.entries(SCHEMA_MODULES)) {
        for (const name of Object.keys(exported)) {
            const previous = seen.get(name)
            if (previous) collisions.push(`${name} is exported by both ${previous} and ${moduleName}`)
            else seen.set(name, moduleName)
        }
    }
    expect(collisions).toEqual([])
})

describe("every route validates the input it takes", () => {
    test("a route with path parameters declares a schema", () => {
        const undeclared = routes.filter(route => !route.schemaName && route.pathParams.length > 0).map(route => `${route.file} ${route.route}`)
        expect(undeclared).toEqual([])
    })

    test("a route without a schema is one of the routes that take no input", () => {
        const unexpected = routes.filter(route => !route.schemaName && !ROUTES_WITHOUT_INPUT.has(route.route)).map(route => `${route.file} ${route.route}`)
        expect(unexpected).toEqual([])
    })

    test("every referenced schema exists", () => {
        const missing = routes.filter(route => route.schemaName && !findSchema(route.schemaName)).map(route => `${route.file} ${route.route} -> ${route.schemaName}`)
        expect(missing).toEqual([])
    })

    test("a params schema covers exactly the parameters of its route", () => {
        const problems: string[] = []
        for (const route of routes) {
            if (!route.schemaName) continue
            const schema = findSchema(route.schemaName)
            if (!schema) continue
            const declared = Object.keys(schema.params?.properties ?? {})
            const missing = route.pathParams.filter(name => !declared.includes(name))
            const surplus = declared.filter(name => !route.pathParams.includes(name))
            // A missing parameter is deleted from `request.params` before the handler
            // runs; a surplus one is required and makes every request a 400.
            if (missing.length) problems.push(`${route.file} ${route.route} [${route.schemaName}] does not declare ${missing}`)
            if (surplus.length) problems.push(`${route.file} ${route.route} [${route.schemaName}] requires ${surplus}, which the route has not`)
        }
        expect(problems).toEqual([])
    })
})
