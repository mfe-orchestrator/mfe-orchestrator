import { createHash } from "node:crypto"
import { APPLICATIONS_CHART_FOLDER } from "./applicationManifests"

/**
 * What Argo CD is given to deploy the GitOps repositories of a project: an AppProject that confines it to
 * them and to the namespaces of its environments, an ApplicationSet from which Argo CD makes an Application
 * per environment syncing its folder of the configuration repository, then per environment an
 * ApplicationSet making an Application of every values file on the branch of the environment in the
 * applications repository. Every environment deploys to the cluster Argo CD runs in.
 */

/** The cluster Argo CD runs in, as Argo CD names it */
export const IN_CLUSTER_SERVER = "https://kubernetes.default.svc"

export const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by"
export const MANAGED_BY = "mfe-orchestrator"
/** What the console finds its own objects by, and tells them from those of a project with the same slug */
export const PROJECT_ID_LABEL = "mfe-orchestrator/project-id"
export const ENVIRONMENT_LABEL = "mfe-orchestrator/environment"
/**
 * `configuration` for the ApplicationSet of the environments, `environment` for what it generates;
 * `applications` for the ApplicationSet of an environment, `application` for what that one generates
 */
export const COMPONENT_LABEL = "mfe-orchestrator/component"

const NAME_MAX_LENGTH = 63
const HASH_LENGTH = 6
/** The AppProject, and the start of every name: `mfe-<project slug>-<hash of the project id>` */
const PROJECT_PREFIX_MAX_LENGTH = 24
/** `<project prefix>.<environment slug>`, the start of the names of an environment */
const ENVIRONMENT_PREFIX_MAX_LENGTH = 32
/** What is left of 63 for the slug of a generated application, after `<environment prefix>.app.` */
const GENERATED_SLUG_MAX_LENGTH = NAME_MAX_LENGTH - ENVIRONMENT_PREFIX_MAX_LENGTH - ".app.".length

const hashOf = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, HASH_LENGTH)

/** Lowercase letters, digits and dashes: what Kubernetes takes in a name and in a label value */
const dnsPart = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")

/** `value`, or when it is longer than `max` its start and a hash of the whole, so two names cut at the same place stay apart */
const bounded = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - HASH_LENGTH - 1).replace(/[-.]+$/, "")}-${hashOf(value)}`)

/**
 * The names are made of dot-separated parts, and no part holds a dot: the project, with a hash of its id so
 * that `shop-eu` and `shop` never meet, then the environment, then what the object is. The Application of an
 * environment is the environment itself, the generated applications end in `.app.<slug>`: no service takes
 * the name of the Application that owns the namespace. Every name fits 63 characters, as Argo CD tracks
 * resources with the name in a label value.
 */
export const appProjectName = (projectId: string, projectSlug: string) => `${bounded(dnsPart(`mfe-${projectSlug}`), PROJECT_PREFIX_MAX_LENGTH - HASH_LENGTH - 1)}-${hashOf(projectId)}`

const environmentPrefix = (projectId: string, projectSlug: string, environmentSlug: string) =>
    bounded(`${appProjectName(projectId, projectSlug)}.${dnsPart(environmentSlug)}`, ENVIRONMENT_PREFIX_MAX_LENGTH)

export const environmentApplicationName = environmentPrefix

export const environmentsApplicationSetName = (projectId: string, projectSlug: string) => `${appProjectName(projectId, projectSlug)}.environments`

export const applicationSetName = (projectId: string, projectSlug: string, environmentSlug: string) => `${environmentPrefix(projectId, projectSlug, environmentSlug)}.applications`

export interface ArgoCdEnvironment {
    /** The folder of the environment in the configuration repository, and its branch in the applications one */
    slug: string
    namespace: string
}

export interface ArgoCdProjectTarget {
    projectId: string
    projectSlug: string
    /** HTTPS clone URLs: the configuration repository, and the applications one when the project has it */
    configurationRepoUrl?: string
    applicationsRepoUrl?: string
    environments: ArgoCdEnvironment[]
}

const labels = (projectId: string, extra: Record<string, string> = {}): Record<string, string> => ({ [MANAGED_BY_LABEL]: MANAGED_BY, [PROJECT_ID_LABEL]: projectId, ...extra })

const AUTOMATED_SYNC = { prune: true, selfHeal: true }

/**
 * The AppProject of the project: its applications read the two repositories only, and write only to the
 * namespaces of its environments in the cluster of Argo CD. Namespace is the one cluster-wide kind allowed,
 * as the configuration repository holds the Namespace of each environment.
 */
export const buildAppProject = (target: ArgoCdProjectTarget) => ({
    apiVersion: "argoproj.io/v1alpha1",
    kind: "AppProject",
    metadata: { name: appProjectName(target.projectId, target.projectSlug), labels: labels(target.projectId) },
    spec: {
        description: `Deployed by MFE Orchestrator from the GitOps repositories of the project ${target.projectSlug}`,
        sourceRepos: [target.configurationRepoUrl, target.applicationsRepoUrl].filter((url): url is string => Boolean(url)),
        destinations: [...new Set(target.environments.map(environment => environment.namespace))].map(namespace => ({ server: IN_CLUSTER_SERVER, namespace })),
        clusterResourceWhitelist: [{ group: "", kind: "Namespace" }]
    }
})

/**
 * The ApplicationSet of the environments: Argo CD makes from it an Application per environment, syncing the
 * folder of the environment on the default branch of the configuration repository (its Namespace, config
 * maps and secrets) into its namespace. The environments are listed here, not found in the repository: a
 * git generator would read the repository outside of the AppProject, and it holds the secrets.
 *
 * An environment left out of the list loses its Application, never what it deployed: the Namespace refuses
 * deletion anyway, and the config maps and the secrets stay for the applications running there.
 */
export const buildEnvironmentsApplicationSet = (target: ArgoCdProjectTarget & { configurationRepoUrl: string }) => ({
    apiVersion: "argoproj.io/v1alpha1",
    kind: "ApplicationSet",
    metadata: { name: environmentsApplicationSetName(target.projectId, target.projectSlug), labels: labels(target.projectId, { [COMPONENT_LABEL]: "configuration" }) },
    spec: {
        goTemplate: true,
        goTemplateOptions: ["missingkey=error"],
        generators: [
            {
                list: {
                    elements: target.environments.map(environment => ({
                        name: environmentApplicationName(target.projectId, target.projectSlug, environment.slug),
                        slug: environment.slug,
                        namespace: environment.namespace
                    }))
                }
            }
        ],
        syncPolicy: { preserveResourcesOnDeletion: true },
        template: {
            metadata: { name: "{{ .name }}", labels: labels(target.projectId, { [ENVIRONMENT_LABEL]: "{{ .slug }}", [COMPONENT_LABEL]: "environment" }) },
            spec: {
                project: appProjectName(target.projectId, target.projectSlug),
                source: { repoURL: target.configurationRepoUrl, targetRevision: "HEAD", path: "{{ .slug }}", directory: { recurse: true } },
                destination: { server: IN_CLUSTER_SERVER, namespace: "{{ .namespace }}" },
                syncPolicy: { automated: AUTOMATED_SYNC }
            }
        }
    }
})

/** The values file the git generator found, without its extension: the slug of the application, and its Helm release */
const APPLICATION_SLUG = '{{ trimSuffix ".yaml" .path.filename }}'

/** The slug in the name of a generated application: as it is when it fits, cut and ended with a hash when it does not */
const GENERATED_SLUG = `{{ $slug := trimSuffix ".yaml" .path.filename | lower }}{{ if le (len $slug) ${GENERATED_SLUG_MAX_LENGTH} }}{{ $slug }}{{ else }}{{ trunc ${GENERATED_SLUG_MAX_LENGTH - HASH_LENGTH - 1} $slug | trimSuffix "-" }}-{{ sha256sum $slug | trunc ${HASH_LENGTH} }}{{ end }}`

/**
 * The ApplicationSet of one environment: an Application per values file at the root of the branch of the
 * environment, installed with the chart of that branch: the chart folder is left out of the generator, its
 * templates are not values files and do not even parse as YAML. The generated applications are named after
 * the project, the environment and the file, and carry the labels of the project.
 *
 * `applicationsSync: create-update` lets the ApplicationSet create and update its applications, never delete
 * them: were the values files wiped from the branch by mistake, every application would otherwise go with
 * them, and its resources with it. An application whose file is gone for good is deleted by hand in Argo CD.
 */
export const buildApplicationSet = (target: ArgoCdProjectTarget & { applicationsRepoUrl: string }, environment: ArgoCdEnvironment) => ({
    apiVersion: "argoproj.io/v1alpha1",
    kind: "ApplicationSet",
    metadata: {
        name: applicationSetName(target.projectId, target.projectSlug, environment.slug),
        labels: labels(target.projectId, { [ENVIRONMENT_LABEL]: environment.slug, [COMPONENT_LABEL]: "applications" })
    },
    spec: {
        goTemplate: true,
        goTemplateOptions: ["missingkey=error"],
        generators: [{ git: { repoURL: target.applicationsRepoUrl, revision: environment.slug, files: [{ path: "*.yaml" }, { path: `${APPLICATIONS_CHART_FOLDER}/**`, exclude: true }] } }],
        syncPolicy: { applicationsSync: "create-update" },
        template: {
            metadata: {
                name: `${environmentPrefix(target.projectId, target.projectSlug, environment.slug)}.app.${GENERATED_SLUG}`,
                labels: labels(target.projectId, { [ENVIRONMENT_LABEL]: environment.slug, [COMPONENT_LABEL]: "application" })
            },
            spec: {
                project: appProjectName(target.projectId, target.projectSlug),
                source: {
                    repoURL: target.applicationsRepoUrl,
                    targetRevision: environment.slug,
                    path: APPLICATIONS_CHART_FOLDER,
                    helm: { releaseName: APPLICATION_SLUG, valueFiles: ["../{{ .path.filename }}"] }
                },
                destination: { server: IN_CLUSTER_SERVER, namespace: environment.namespace },
                syncPolicy: { automated: AUTOMATED_SYNC, syncOptions: ["CreateNamespace=true"] }
            }
        }
    }
})

/**
 * Everything Argo CD should hold for the project: the ApplicationSet of the environments when there is a
 * configuration repository, one per environment when there is an applications one. `environmentApplications`
 * are the names Argo CD will give the Applications of the environments.
 */
export const buildArgoCdState = (target: ArgoCdProjectTarget) => {
    const { configurationRepoUrl, applicationsRepoUrl } = target
    return {
        appProject: buildAppProject(target),
        environmentApplications: configurationRepoUrl ? target.environments.map(environment => environmentApplicationName(target.projectId, target.projectSlug, environment.slug)) : [],
        applicationSets: [
            ...(configurationRepoUrl ? [buildEnvironmentsApplicationSet({ ...target, configurationRepoUrl })] : []),
            ...(applicationsRepoUrl ? target.environments.map(environment => buildApplicationSet({ ...target, applicationsRepoUrl }, environment)) : [])
        ]
    }
}
