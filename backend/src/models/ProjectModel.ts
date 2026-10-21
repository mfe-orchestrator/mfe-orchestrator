import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { CERTIFICATE_ISSUER, DOMAIN_NAME } from "../types/Exposure"
import { encryptedFields } from "../utils/encryptedFieldsPlugin"
import type { ICodeRepositoryMicrofrontend } from "./MicrofrontendModel"

/** Upper bound of a context, of a project, a domain, a microfrontend or a service: it ends up in the prompt of every agent reading it. */
export const CONTEXT_MAX_LENGTH = 20_000

/** Config maps and secrets committed to a repository as Kubernetes manifests, every time one is saved */
export interface IProjectGitOps {
    enabled: boolean
    /** Linked like the repository of a microfrontend, through one of the connections of the project */
    codeRepository?: ICodeRepositoryMicrofrontend
    /** Where the Helm values of the applications go, one branch per environment; none when left out */
    applicationsCodeRepository?: ICodeRepositoryMicrofrontend
}

/**
 * Where the pipelines copied into the repositories scaffolded from a template come from, in place of the
 * official template-pipelines: a repository with the same layout. Unset, the official ones are used.
 */
export interface IProjectPipelines {
    /** Linked like the repository of a microfrontend, through one of the connections of the project */
    codeRepository: ICodeRepositoryMicrofrontend
    /** The branch or tag read; the default branch of the repository when left out */
    ref?: string
}

/**
 * How Argo CD reads one GitOps repository. A GitLab one gets a deploy token the console creates and rotates
 * on every initialization; GitHub and Azure DevOps cannot hand one out through their API, so the token is the
 * one the owner pasted, the same for both repositories.
 */
export interface IArgoCdRepositoryCredential {
    source: "deployToken" | "manual"
    username: string
    password: string
    /** The Argo CD the credentials were handed to, and the clone URL they are registered for there */
    argoCdUrl: string
    repoUrl: string
    /** The AppProject the registration is scoped to; global when unset */
    argoProject?: string
    /** The connection the repository was linked through when the credentials were made */
    codeRepositoryId: string
    /** The deploy token on GitLab, revoked once Argo CD has the next one */
    deployTokenId?: number
    /** The numeric id of the GitLab project the deploy token was created on */
    gitlabProjectId?: number
}

/** A registration of a repository in Argo CD whose deletion failed: retried by the next initialization */
export interface IArgoCdRepositoryRegistration {
    argoCdUrl: string
    repoUrl: string
    argoProject?: string
}

/** Why the last initialization failed, by code, for the screen to translate; the message for whatever has none */
export interface IArgoCdError {
    code?: string
    message: string
    details?: Record<string, unknown>
}

/** The Argo CD instance the GitOps repositories of the project are handed to, through its API only */
export interface IProjectArgoCd {
    /** Base URL of Argo CD, without a trailing slash */
    url?: string
    /** API token of the account the console acts as */
    token?: string
    repositories?: {
        configuration?: IArgoCdRepositoryCredential
        applications?: IArgoCdRepositoryCredential
    }
    initializedAt?: Date
    /** Why the last initialization failed; gone once one goes through */
    lastError?: IArgoCdError
    /** Why the last deploy did not align the ApplicationSets of the applications; gone once one does, or an initialization goes through */
    alignError?: IArgoCdError
    /** Registrations of repositories no longer used that Argo CD did not delete yet: no credential in them */
    pendingRepositoryDeletions?: IArgoCdRepositoryRegistration[]
    /** Set while an initialization runs, and renewed by each of its saves: a second one waits for it to end, or to be this old */
    initializingAt?: Date
}

/**
 * Where the environments of the project are exposed, each on its subdomain of `domain`: GitOps commits a
 * Gateway for each of them, and an HTTPRoute for each application with the path it is exposed at.
 */
export interface IProjectExposure {
    domain: string
    /** The cert-manager ClusterIssuer the certificate of each environment is asked of; without one, HTTP only */
    certificateIssuer?: string
    /** The ports of the HTTP and HTTPS listeners, those of the Traefik entry points: 80 and 443 when unset */
    httpPort?: number
    httpsPort?: number
}

/** The credentials of Argo CD the console keeps: encrypted at rest, never sent to a client */
export const PROJECT_SECRET_PATHS = ["argoCd.token", "argoCd.repositories.configuration.password", "argoCd.repositories.applications.password"]

export interface IProject extends Document<ObjectId> {
    /** The organization owning the project. A project belongs to exactly one, and never changes hands. */
    organizationId: Schema.Types.ObjectId
    name: string
    slug: string
    description?: string
    /** Markdown written by the team for AI agents (MCP clients, the console assistant): conventions, domain, rules. */
    context?: string
    isActive: boolean
    gitOps?: IProjectGitOps
    /** Apart from gitOps: saving the GitOps settings replaces that object whole */
    argoCd?: IProjectArgoCd
    exposure?: IProjectExposure
    pipelines?: IProjectPipelines
    /**
     * The AIs of the organization the project may use, by id (`system` for the one of the environment).
     * Unset: all of them, the ones added later included. Empty: AI is off for the project.
     */
    aiModelIds?: string[]
    createdAt: Date
    updatedAt: Date
}

const projectSchema = new Schema<IProject>(
    {
        organizationId: {
            type: Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        slug: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255
        },
        description: {
            type: String,
            trim: true
        },
        context: {
            type: String,
            trim: true,
            maxlength: CONTEXT_MAX_LENGTH
        },
        isActive: {
            type: Boolean,
            default: true
        },
        gitOps: {
            enabled: { type: Boolean, default: false },
            // Written by GitOpsService only, from what the provider answered: never from the request body
            codeRepository: { type: Schema.Types.Mixed },
            applicationsCodeRepository: { type: Schema.Types.Mixed }
        },
        // Written by ArgoCdService only
        argoCd: { type: Schema.Types.Mixed },
        exposure: {
            type: new Schema<IProjectExposure>(
                {
                    domain: { type: String, required: true, trim: true, lowercase: true, match: DOMAIN_NAME },
                    certificateIssuer: { type: String, trim: true, match: CERTIFICATE_ISSUER },
                    httpPort: { type: Number, min: 1, max: 65535 },
                    httpsPort: { type: Number, min: 1, max: 65535 }
                },
                { _id: false }
            ),
            required: false
        },
        pipelines: {
            // Written by ProjectService only, from what the provider answered: never from the request body
            codeRepository: { type: Schema.Types.Mixed },
            ref: { type: String, trim: true }
        },
        // No default: an empty array would turn AI off, where unset means every AI of the organization
        aiModelIds: { type: [String], default: undefined }
    },
    {
        timestamps: true
    }
)

projectSchema.plugin(encryptedFields, { model: "Project", paths: PROJECT_SECRET_PATHS })

/**
 * Every way out of the backend serialises a project through here. ArgoCdService answers with what the
 * screen needs of Argo CD, so the whole object stays behind, the credentials with it.
 */
projectSchema.set("toJSON", {
    transform: (_document, object) => {
        delete object.argoCd
        return object
    }
})

const Project = mongoose.model<IProject>("Project", projectSchema)
export default Project
