import { Types } from "mongoose"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"
import { APPLICATIONS_CHART_FOLDER, CHART_FILES, isDeployable, MANAGED_VALUES_MARKER, renderApplicationValues, splitImage } from "./applicationManifests"

describe("splitImage", () => {
    it.each([
        ["ghcr.io/acme/x", { host: "ghcr.io", name: "acme/x" }],
        ["nginx", { host: "docker.io", name: "nginx" }],
        ["library/nginx", { host: "docker.io", name: "library/nginx" }],
        ["localhost:5000/x", { host: "localhost:5000", name: "x" }]
    ])("given the image %s, when it is split, then the registry and the name are told apart", (repository, expected) => {
        expect(splitImage(repository)).toEqual(expected)
    })
})

describe("isDeployable", () => {
    it("given a version and an image, when it is checked, then the application can be deployed", () => {
        expect(isDeployable({ slug: "orders", version: "1.0.0", image: { repository: "ghcr.io/acme/orders" } })).toBe(true)
    })

    it.each([
        ["no version", { slug: "orders", image: { repository: "ghcr.io/acme/orders" } }],
        ["no image", { slug: "orders", version: "1.0.0" }],
        ["an empty repository", { slug: "orders", version: "1.0.0", image: { repository: "" } }]
    ])("given %s, when it is checked, then the application is left out", (_case, application) => {
        expect(isDeployable(application)).toBe(false)
    })
})

describe("renderApplicationValues", () => {
    const environment = { _id: new Types.ObjectId(), slug: "production" }
    const configMapId = new Types.ObjectId()
    const secretId = new Types.ObjectId()
    const mapNames = { configMaps: new Map([[String(configMapId), "logging"]]), secrets: new Map([[String(secretId), "database"]]) }
    const application = {
        slug: "orders",
        version: "1.2.3",
        image: { repository: "ghcr.io/acme/orders" },
        port: 3000,
        livenessPath: "/live",
        configMapIds: [configMapId, new Types.ObjectId()],
        secretIds: [secretId],
        urls: [{ environmentId: environment._id, url: "https://orders.example.com/api" }]
    }
    const render = (overrides = {}) => renderApplicationValues({ ...application, ...overrides }, environment, mapNames)

    it("given an application, when its values are rendered, then the first line is the managed marker", () => {
        expect(render().split("\n")[0]).toBe(MANAGED_VALUES_MARKER)
    })

    it("given an application, when its values are rendered, then the image has the registry, the name and the version as tag", () => {
        expect(parse(render()).image).toEqual({ host: "ghcr.io", name: "acme/orders", tag: "1.2.3" })
    })

    it("given maps attached by id, when its values are rendered, then they go by name and an unknown id is left out", () => {
        const values = parse(render())

        expect(values.environmentMaps).toEqual(["logging"])
        expect(values.secrets).toEqual(["database"])
    })

    it("given a URL in the environment, when its values are rendered, then the ingress has its host and path", () => {
        expect(parse(render()).ingress).toEqual({ host: "orders.example.com", path: "/api" })
    })

    it("given a URL of another environment only, when its values are rendered, then there is no ingress", () => {
        expect(parse(render({ urls: [{ environmentId: new Types.ObjectId(), url: "https://other.example.com" }] })).ingress).toBeUndefined()
    })

    it("given an exposure path and a Gateway, when its values are rendered, then the route is on the Gateway with the path", () => {
        const values = parse(renderApplicationValues({ ...application, exposurePath: "/api/orders" }, environment, mapNames, { name: "mfe-shop-1a2b3c", listener: "https", hsts: true }))

        expect(values.route).toEqual({ gateway: "mfe-shop-1a2b3c", listener: "https", path: "/api/orders", hsts: true })
    })

    it.each([
        ["no exposure path", {}, { name: "mfe-shop-1a2b3c", listener: "https", hsts: true }],
        ["no Gateway in the environment", { exposurePath: "/api/orders" }, undefined]
    ])("given %s, when its values are rendered, then there is no route", (_case, overrides, gateway) => {
        expect(parse(renderApplicationValues({ ...application, ...overrides }, environment, mapNames, gateway)).route).toBeUndefined()
    })

    it("given a port and a liveness path, when its values are rendered, then the container port and the liveness probe follow them", () => {
        const values = parse(render())

        expect(values.containerPort).toBe(3000)
        expect(values.probes).toEqual({ liveness: { active: true, path: "/live" }, readiness: { active: false, path: "/" } })
    })
})

describe("CHART_FILES", () => {
    it("given the chart, when its files are listed, then they all sit in the chart folder and include Chart.yaml", () => {
        expect(CHART_FILES.every(file => file.path.startsWith(`${APPLICATIONS_CHART_FOLDER}/`))).toBe(true)
        expect(CHART_FILES.map(file => file.path)).toContain(`${APPLICATIONS_CHART_FOLDER}/Chart.yaml`)
        expect(CHART_FILES.map(file => file.path)).toContain(`${APPLICATIONS_CHART_FOLDER}/templates/httproute.yaml`)
    })
})
