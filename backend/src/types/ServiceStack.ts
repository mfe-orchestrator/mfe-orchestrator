import { MicrofrontendStackSource } from "./MicrofrontendStack"

/** The marketplace `type` of a template that scaffolds a backend service rather than a microfrontend */
export const SERVICE_TEMPLATE_TYPE = "service"

/** Whether a marketplace `type` is the service one: the marketplace is hand edited, so its case is not trusted */
export const isServiceTemplateType = (type?: string): boolean => type?.trim().toLowerCase() === SERVICE_TEMPLATE_TYPE

/**
 * What a service slug may be. It names the workspace folder (a subset of SAFE_SEGMENT in
 * utils/workspacePaths.ts), the registration URL the CI calls and usually the image, so it is
 * checked before anything is created at the provider.
 */
export const SERVICE_SLUG = /^[a-z0-9][a-z0-9-]{1,49}$/

/** What a version may be: it becomes a git tag and an image tag, which take no `+`, space or slash */
export const SERVICE_VERSION = /^[A-Za-z0-9._-]{1,128}$/

/**
 * What an HTTP path of a service may be (probes, API docs, OpenAPI spec): absolute, at most 256
 * characters and without whitespace, since it becomes a Kubernetes probe path and a link.
 */
export const SERVICE_HTTP_PATH = /^\/\S{0,255}$/

export const SERVICE_URL_MAX_LENGTH = 2048

/**
 * What a base URL of a service may be: absolute http(s), no whitespace, and nothing a path could not
 * follow (no query, no fragment), so that appending `/docs` gives a working link. No credentials: the
 * URL is shown to whoever reads the service, unlike its secrets.
 */
export const isServiceUrl = (value: string): boolean => {
    if (value.length > SERVICE_URL_MAX_LENGTH || /\s/.test(value) || !URL.canParse(value)) return false
    const url = new URL(value)
    return ["http:", "https:"].includes(url.protocol) && !url.search && !url.hash && !url.username && !url.password
}

/** What a key of the config map or of the secrets may be: it reaches the container as an environment variable name */
export const SERVICE_VARIABLE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/

/** The HTTP paths a service exposes: the probes Kubernetes calls and its public API documentation */
export interface ServicePaths {
    livenessPath: string
    readinessPath: string
    /** The UI of the public API documentation, e.g. /docs */
    docsPath?: string
    /** The OpenAPI spec, e.g. /openapi.json */
    openApiPath?: string
}

/** What a service template fills in when the service being created does not say otherwise */
export interface ServiceDefaults extends ServicePaths {
    port: number
}

/** The language runtime a backend service image is built on */
export enum ServiceRuntime {
    NODE = "NODE",
    PYTHON = "PYTHON",
    GO = "GO",
    DOTNET = "DOTNET",
    JAVA = "JAVA",
    OTHER = "OTHER"
}

export interface ServiceStackDTO {
    runtime?: ServiceRuntime
    framework?: string
    source: MicrofrontendStackSource
    detectedAt?: Date
}

const RUNTIME_BY_NAME: Record<string, ServiceRuntime> = {
    node: ServiceRuntime.NODE,
    "node.js": ServiceRuntime.NODE,
    nodejs: ServiceRuntime.NODE,
    python: ServiceRuntime.PYTHON,
    go: ServiceRuntime.GO,
    golang: ServiceRuntime.GO,
    dotnet: ServiceRuntime.DOTNET,
    ".net": ServiceRuntime.DOTNET,
    java: ServiceRuntime.JAVA,
    "spring boot": ServiceRuntime.JAVA,
    "spring-boot": ServiceRuntime.JAVA,
    quarkus: ServiceRuntime.JAVA
}

/**
 * The marketplace spells the framework of a service template freely ("Node.js", "Spring Boot", "Quarkus"),
 * so it is normalised here. A value given but not recognised is OTHER: the service does run on
 * something, only not on a runtime this console knows by name.
 */
export const parseRuntime = (value?: string): ServiceRuntime | undefined => {
    if (!value?.trim()) return undefined
    return RUNTIME_BY_NAME[value.trim().toLowerCase()] ?? ServiceRuntime.OTHER
}
