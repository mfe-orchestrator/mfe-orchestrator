import { IMarket } from "../models/MarketModel"
import { ServiceDefaults } from "../types/ServiceStack"

const serviceTemplate = (slug: string, name: string, framework: string, description: string, serviceDefaults: ServiceDefaults): IMarket =>
    ({
        name,
        slug,
        description,
        version: "1.0.0",
        author: "Lorenzo De Francesco",
        license: "MIT",
        repo: `https://github.com/mfe-orchestrator/template-${slug}`,
        zipUrl: `https://github.com/mfe-orchestrator/template-${slug}/archive/refs/heads/main.zip`,
        tags: ["template", "backend", "docker"],
        type: "service",
        compiler: "docker",
        framework,
        category: "Backend",
        icon: "/templates/docker.svg",
        serviceDefaults
    }) as IMarket

/**
 * The backend service templates ship with the backend instead of the shared marketplace.json:
 * every installation reads that manifest live, and one without services would offer these as
 * microfrontend templates.
 */
export const SERVICE_TEMPLATES: IMarket[] = [
    serviceTemplate("service-node-fastify", "Node.js & Fastify", "Node.js", "Backend service with Node.js, TypeScript and Fastify, packaged as a Docker image", {
        port: 8080,
        livenessPath: "/health/live",
        readinessPath: "/health/ready",
        docsPath: "/docs",
        openApiPath: "/openapi.json"
    }),
    serviceTemplate("service-spring-boot", "Spring Boot", "Spring Boot", "Backend service with Java and Spring Boot, packaged as a Docker image", {
        port: 8080,
        livenessPath: "/actuator/health/liveness",
        readinessPath: "/actuator/health/readiness",
        docsPath: "/swagger-ui.html",
        openApiPath: "/v3/api-docs"
    }),
    serviceTemplate("service-quarkus", "Quarkus", "Quarkus", "Backend service with Java and Quarkus, packaged as a Docker image", {
        port: 8080,
        livenessPath: "/q/health/live",
        readinessPath: "/q/health/ready",
        docsPath: "/q/swagger-ui",
        openApiPath: "/q/openapi"
    })
]
