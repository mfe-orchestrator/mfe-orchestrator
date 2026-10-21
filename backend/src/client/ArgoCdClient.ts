import axios, { AxiosInstance } from "axios"
import { BusinessException, createBusinessException } from "../errors/BusinessException"

/** What Node reports when the certificate of the server cannot be trusted: told apart from a server that does not answer */
const TLS_ERRORS = new Set([
    "CERT_HAS_EXPIRED",
    "CERT_NOT_YET_VALID",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "ERR_TLS_CERT_ALTNAME_INVALID"
])

export interface ArgoCdMetadata {
    name: string
    labels?: Record<string, string>
}

/** An AppProject, an Application or an ApplicationSet: the console reads back only the metadata */
export interface ArgoCdResource {
    apiVersion?: string
    kind?: string
    metadata: ArgoCdMetadata
    spec?: Record<string, unknown>
}

export interface ArgoCdRepository {
    repo: string
    username: string
    password: string
    /** The AppProject the credentials are scoped to, only its applications may use them; global when left out */
    project?: string
}

/** A repository as Argo CD answers: never the credentials */
export interface ArgoCdRegisteredRepository {
    repo: string
    project?: string
}

/** As Argo CD compares the URLs of repositories: case, a trailing slash and .git aside */
const sameRepoUrl = (a: string, b: string) => {
    const normalize = (url: string) =>
        url
            .trim()
            .toLowerCase()
            .replace(/\/$/, "")
            .replace(/\.git$/, "")
    return normalize(a) === normalize(b)
}

/** How much of the message of an error of Argo CD goes into ours: the rest is not ours to show */
const MESSAGE_MAX_LENGTH = 200

export interface ArgoCdUserInfo {
    loggedIn: boolean
    username?: string
}

/**
 * The REST API of an Argo CD instance, `<url>/api/v1`, with the bearer token of the account the console acts
 * as. Argo CD runs on another cluster: the API is the only way in. Every failure comes back as a business
 * error saying what to check, the URL, the network, the certificate, the token or its RBAC policy.
 */
class ArgoCdClient {
    private api: AxiosInstance

    constructor(
        private readonly url: string,
        token: string
    ) {
        this.api = axios.create({
            baseURL: `${url}/api/v1`,
            headers: { Authorization: `Bearer ${token}` },
            timeout: 30_000,
            // A redirect would take the token to wherever Argo CD, or whoever answers in its place, points
            maxRedirects: 0
        })
    }

    /** The account behind the token: one Argo CD does not recognise is refused before anything is written */
    async getUserInfo(): Promise<ArgoCdUserInfo> {
        const info = await this.call("read the session of the token", () => this.api.get<ArgoCdUserInfo>("/session/userinfo"))
        if (!info?.loggedIn) throw this.unauthorized()
        return info
    }

    /** Registers the credentials of a repository, or replaces them */
    async upsertRepository(repository: ArgoCdRepository): Promise<void> {
        await this.call(`register the repository ${repository.repo}`, () => this.api.post("/repositories", { type: "git", ...repository }, { params: { upsert: true, credsOnly: false } }))
    }

    /**
     * The repository registered with that URL, globally or in any AppProject; null when the account sees none.
     * Read from the list: Argo CD answers 403, not 404, for a URL it has no repository of, not to tell which exist
     */
    async getRepository(repo: string): Promise<ArgoCdRegisteredRepository | null> {
        return (await this.listRepositories()).find(registered => sameRepoUrl(registered.repo, repo)) ?? null
    }

    /** One already gone is not an error: looked for in the list first, as Argo CD answers 403 for it */
    async deleteRepository(repo: string, project?: string): Promise<void> {
        const registered = await this.listRepositories()
        if (!registered.some(registration => sameRepoUrl(registration.repo, repo) && (registration.project || undefined) === project)) return
        await this.find(`delete the repository ${repo}`, () => this.api.delete(`/repositories/${encodeURIComponent(repo)}`, { params: { appProject: project } }))
    }

    private async listRepositories(): Promise<ArgoCdRegisteredRepository[]> {
        const list = await this.call("list the repositories", () => this.api.get<{ items?: ArgoCdRegisteredRepository[] | null }>("/repositories"))
        return list?.items ?? []
    }

    /** The AppProject of that name, null when there is none */
    async getProject(name: string): Promise<ArgoCdResource | null> {
        return this.find(`read the AppProject ${name}`, () => this.api.get<ArgoCdResource>(`/projects/${encodeURIComponent(name)}`))
    }

    /** The Application of that name in `project`, null when there is none */
    async getApplication(name: string, project: string): Promise<ArgoCdResource | null> {
        return this.find(`read the Application ${name}`, () => this.api.get<ArgoCdResource>(`/applications/${encodeURIComponent(name)}`, { params: { project } }))
    }

    async getApplicationSet(name: string): Promise<ArgoCdResource | null> {
        return this.find(`read the ApplicationSet ${name}`, () => this.api.get<ArgoCdResource>(`/applicationsets/${encodeURIComponent(name)}`))
    }

    async upsertProject(project: ArgoCdResource): Promise<void> {
        await this.call(`save the AppProject ${project.metadata.name}`, () => this.api.post("/projects", { project, upsert: true }))
    }

    /** The Applications of `project` with the labels of `selector` */
    async listApplications(selector: string, project: string): Promise<ArgoCdResource[]> {
        const list = await this.call("list the Applications", () => this.api.get<{ items?: ArgoCdResource[] | null }>("/applications", { params: { selector, projects: project } }))
        return list?.items ?? []
    }

    /** Without cascade: what the application deployed stays in the cluster */
    async deleteApplication(name: string): Promise<void> {
        await this.call(`delete the Application ${name}`, () => this.api.delete(`/applications/${encodeURIComponent(name)}`, { params: { cascade: false } }))
    }

    async upsertApplicationSet(applicationSet: ArgoCdResource): Promise<void> {
        await this.call(`save the ApplicationSet ${applicationSet.metadata.name}`, () => this.api.post("/applicationsets", applicationSet, { params: { upsert: true } }))
    }

    /** The ApplicationSets of `project` with the labels of `selector` */
    async listApplicationSets(selector: string, project: string): Promise<ArgoCdResource[]> {
        const list = await this.call("list the ApplicationSets", () => this.api.get<{ items?: ArgoCdResource[] | null }>("/applicationsets", { params: { selector, projects: project } }))
        return list?.items ?? []
    }

    async deleteApplicationSet(name: string): Promise<void> {
        await this.call(`delete the ApplicationSet ${name}`, () => this.api.delete(`/applicationsets/${encodeURIComponent(name)}`))
    }

    /** What `request` answers, null when Argo CD has no such object */
    private async find<T>(action: string, request: () => Promise<{ data: T }>): Promise<T | null> {
        try {
            return (await request()).data
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) return null
            throw this.failure(action, error)
        }
    }

    private async call<T>(action: string, request: () => Promise<{ data: T }>): Promise<T> {
        try {
            return (await request()).data
        } catch (error) {
            throw this.failure(action, error)
        }
    }

    private unauthorized(): BusinessException {
        // 422 and not 401: the session of the user with the console is fine, the token of Argo CD is not
        return createBusinessException({
            code: "ARGOCD_UNAUTHORIZED",
            message: `Argo CD at ${this.url} does not accept the token: check that it is an API token of the orchestrator account (argocd account generate-token --account orchestrator) and that it has not expired or been revoked`,
            statusCode: 422,
            details: { url: this.url }
        })
    }

    private failure(action: string, error: unknown): BusinessException {
        if (!axios.isAxiosError(error)) {
            const reason = error instanceof Error ? error.message : String(error)
            return createBusinessException({ code: "ARGOCD_REQUEST_FAILED", message: `Argo CD did not ${action}: ${reason}`, statusCode: 502, details: { url: this.url, reason } })
        }
        if (!error.response) {
            const reason = error.code || error.message
            if (TLS_ERRORS.has(error.code ?? "")) {
                return createBusinessException({
                    code: "ARGOCD_TLS_UNTRUSTED",
                    message: `The certificate of Argo CD at ${this.url} is not trusted (${reason}): serve the API with a certificate of a trusted authority, or add its CA to NODE_EXTRA_CA_CERTS of the orchestrator`,
                    statusCode: 502,
                    details: { url: this.url, reason }
                })
            }
            return createBusinessException({
                code: "ARGOCD_UNREACHABLE",
                message: `Argo CD cannot be reached at ${this.url} (${reason}): check the URL, and that the cluster of the orchestrator can open connections to the Argo CD API`,
                statusCode: 502,
                details: { url: this.url, reason }
            })
        }
        const status = error.response.status
        if (status === 401) return this.unauthorized()
        if (status === 403) {
            return createBusinessException({
                code: "ARGOCD_FORBIDDEN",
                message: `The Argo CD account of the token may not ${action}: grant it role:orchestrator in argocd-rbac-cm, as docs/ARGOCD.md shows`,
                statusCode: 422,
                details: { url: this.url, reason: action }
            })
        }
        // Only the message of an error Argo CD shaped: a proxy in front of it may answer with a whole page
        const data = error.response.data as { message?: unknown } | undefined
        const message = data && typeof data === "object" && typeof data.message === "string" ? data.message.slice(0, MESSAGE_MAX_LENGTH) : undefined
        const reason = message ? `${status} ${message}` : String(status)
        return createBusinessException({ code: "ARGOCD_REQUEST_FAILED", message: `Argo CD did not ${action} (${reason})`, statusCode: 502, details: { url: this.url, reason } })
    }
}

export default ArgoCdClient
