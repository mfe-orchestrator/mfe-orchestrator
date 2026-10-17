import { afterEach, describe, expect, it, vi } from "vitest"
import Market from "../models/MarketModel"
import { SERVICE_HTTP_PATH } from "../types/ServiceStack"
import MarketService from "./MarketService"
import { SERVICE_TEMPLATES } from "./serviceTemplates"

const remoteTemplate = { slug: "vite-remote-react", name: "Vite & React", type: "remote", compiler: "vite", framework: "React" }

const stubManifest = (entries: unknown[]) => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => entries })
    vi.stubGlobal("fetch", fetchMock)
    return fetchMock
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe("MarketService", () => {
    it("Given the shared manifest, when the templates are listed, then the service templates shipped with the backend come with them", async () => {
        stubManifest([remoteTemplate])
        vi.spyOn(Market, "find").mockReturnValue({ sort: async () => [] } as never)

        const templates = await new MarketService().getAll()

        expect(templates.map(t => t.slug)).toEqual(["vite-remote-react", ...SERVICE_TEMPLATES.map(t => t.slug)])
    })

    it("Given the manifest also lists a service template, when the templates are listed, then it appears once, as shipped with the backend", async () => {
        stubManifest([remoteTemplate, { ...SERVICE_TEMPLATES[0], name: "Stale copy" }])
        vi.spyOn(Market, "find").mockReturnValue({ sort: async () => [] } as never)

        const templates = await new MarketService().getAll()

        const copies = templates.filter(t => t.slug === SERVICE_TEMPLATES[0].slug)
        expect(copies).toEqual([SERVICE_TEMPLATES[0]])
    })

    it("Given a service template slug, when it is looked up, then it is found without reading the manifest", async () => {
        const fetchMock = stubManifest([])

        const template = await new MarketService().getSingle("service-quarkus")

        expect(template?.type).toBe("service")
        expect(template?.zipUrl).toBe("https://github.com/mfe-orchestrator/template-service-quarkus/archive/refs/heads/main.zip")
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it("ships exactly the Node.js, Spring Boot and Quarkus service templates", () => {
        expect(SERVICE_TEMPLATES.map(t => [t.slug, t.name, t.framework, t.repo])).toEqual([
            ["service-node-fastify", "Node.js & Fastify", "Node.js", "https://github.com/mfe-orchestrator/template-service-node-fastify"],
            ["service-spring-boot", "Spring Boot", "Spring Boot", "https://github.com/mfe-orchestrator/template-service-spring-boot"],
            ["service-quarkus", "Quarkus", "Quarkus", "https://github.com/mfe-orchestrator/template-service-quarkus"]
        ])
    })

    it.each([
        ["service-node-fastify", { port: 8080, livenessPath: "/health/live", readinessPath: "/health/ready", docsPath: "/docs", openApiPath: "/openapi.json" }],
        ["service-spring-boot", { port: 8080, livenessPath: "/actuator/health/liveness", readinessPath: "/actuator/health/readiness", docsPath: "/swagger-ui.html", openApiPath: "/v3/api-docs" }],
        ["service-quarkus", { port: 8080, livenessPath: "/q/health/live", readinessPath: "/q/health/ready", docsPath: "/q/swagger-ui", openApiPath: "/q/openapi" }]
    ])("Given the %s template, then it declares the port, probes and API docs of its framework", (slug, defaults) => {
        expect(SERVICE_TEMPLATES.find(t => t.slug === slug)?.serviceDefaults).toEqual(defaults)
    })

    it("Given every service template, then its paths are valid service paths", () => {
        for (const template of SERVICE_TEMPLATES) {
            const { port: _port, ...paths } = template.serviceDefaults ?? {}
            expect(Object.values(paths).every(path => typeof path === "string" && SERVICE_HTTP_PATH.test(path))).toBe(true)
        }
    })
})
