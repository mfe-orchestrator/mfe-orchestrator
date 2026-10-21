import { createHash } from "node:crypto"
import { APPLICATIONS_CHART_FOLDER, applicationValuesPath } from "./applicationManifests"

/**
 * What Argo CD is given to deploy the GitOps repositories of a project: an AppProject that confines it to
 * them and to the namespaces of its environments, an ApplicationSet from which Argo CD makes an Application
 * per environment syncing its folder of the configuration repository, then per service and frontend an
 * ApplicationSet making an Application of it in every environment whose branch of the applications repository
 * holds its values file. Every environment deploys to the cluster Argo CD runs in.
 */

/** The cluster Argo CD runs in, as Argo CD names it */
export const IN_CLUSTER_SERVER = "https://kubernetes.default.svc"

export const MANAGED_BY_LABEL = "app.kubernetes.io/managed-by"
export const MANAGED_BY = "mfe-orchestrator"
/** What the console finds its own objects by, and tells them from those of a project with the same slug */
export const PROJECT_ID_LABEL = "mfe-orchestrator/project-id"
export const ENVIRONMENT_LABEL = "mfe-orchestrator/environment"
/** The slug of the service or frontend an ApplicationSet, and what it generates, are of */
export const APPLICATION_LABEL = "mfe-orchestrator/application"
/**
 * `configuration` for the ApplicationSet of the environments, `environment` for what it generates;
 * `applications` for the ApplicationSet of a service or frontend, `application` for what that one generates
 */
export const COMPONENT_LABEL = "mfe-orchestrator/component"

const NAME_MAX_LENGTH = 63
const HASH_LENGTH = 6

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
 * Every name is `<project slug>-<parts>-<hash of the project id>`, the AppProject `<project slug>-<hash>`: the hash keeps the projects apart, `shop-eu`
 * and `shop` never meet. The Application of an environment is `<project slug>-<environment>-<hash>`, the
 * ApplicationSet of a service or frontend `<project slug>-<slug>-<hash>`, and what it generates
 * `<project slug>-<slug>-<environment>-<hash>`. Two objects of the same project that would meet are refused by
 * clashingName. Every name fits 63 characters, as Argo CD tracks resources with the name in a label value.
 */
const scopedName = (projectId: string, projectSlug: string, ...parts: string[]) => `${bounded(dnsPart([projectSlug, ...parts].join("-")), NAME_MAX_LENGTH - HASH_LENGTH - 1)}-${hashOf(projectId)}`

/** The AppProject, and the Gateway of every environment: `<project slug>-<hash>` */
export const appProjectName = (projectId: string, projectSlug: string) => scopedName(projectId, projectSlug)

export const environmentApplicationName = (projectId: string, projectSlug: string, environmentSlug: string) => scopedName(projectId, projectSlug, environmentSlug)

export const environmentsApplicationSetName = (projectId: string, projectSlug: string) => scopedName(projectId, projectSlug, "environments")

export const applicationSetName = (projectId: string, projectSlug: string, applicationSlug: string) => scopedName(projectId, projectSlug, applicationSlug)

/** The Application of a service or frontend in one environment: `<project slug>-<application>-<environment>-<hash>` */
export const applicationName = (projectId: string, projectSlug: string, applicationSlug: string, environmentSlug: string) => scopedName(projectId, projectSlug, applicationSlug, environmentSlug)

/** A slug as a label value takes it */
const labelValue = (slug: string) => bounded(dnsPart(slug), NAME_MAX_LENGTH)

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
    /** The slugs of the services and frontends a deploy writes the values of */
    applications?: string[]
    /** The branches of the applications repository: an environment without one has no application yet */
    applicationBranches?: string[]
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

/**
 * The ApplicationSet of one service or frontend: an Application per environment whose branch holds its values
 * file, installed with the chart of that branch. The environments are listed, those without a branch left out:
 * a git generator on a revision that does not exist fails the whole ApplicationSet. Per listed environment the
 * git generator looks for the values file on its branch, so an environment the application was never deployed
 * to gets no Application. The parameters of the environment sit under `environment`, a key no values file has,
 * as the matrix merges them with the content of the file.
 *
 * `applicationsSync: create-update` lets the ApplicationSet create and update its applications, never delete
 * them: were the values file wiped from a branch by mistake, the application would otherwise go with it, and
 * its resources with it. An application whose file is gone for good is deleted by hand in Argo CD.
 */
export const buildApplicationSet = (target: ArgoCdProjectTarget & { applicationsRepoUrl: string }, applicationSlug: string, environments: ArgoCdEnvironment[]) => ({
    apiVersion: "argoproj.io/v1alpha1",
    kind: "ApplicationSet",
    metadata: {
        name: applicationSetName(target.projectId, target.projectSlug, applicationSlug),
        labels: labels(target.projectId, { [APPLICATION_LABEL]: labelValue(applicationSlug), [COMPONENT_LABEL]: "applications" })
    },
    spec: {
        goTemplate: true,
        goTemplateOptions: ["missingkey=error"],
        generators: [
            {
                matrix: {
                    generators: [
                        {
                            list: {
                                elements: environments.map(environment => ({
                                    environment: {
                                        name: applicationName(target.projectId, target.projectSlug, applicationSlug, environment.slug),
                                        slug: environment.slug,
                                        namespace: environment.namespace
                                    }
                                }))
                            }
                        },
                        { git: { repoURL: target.applicationsRepoUrl, revision: "{{ .environment.slug }}", files: [{ path: applicationValuesPath({ slug: applicationSlug }) }] } }
                    ]
                }
            }
        ],
        syncPolicy: { applicationsSync: "create-update" },
        template: {
            metadata: {
                name: "{{ .environment.name }}",
                labels: labels(target.projectId, { [APPLICATION_LABEL]: labelValue(applicationSlug), [ENVIRONMENT_LABEL]: "{{ .environment.slug }}", [COMPONENT_LABEL]: "application" })
            },
            spec: {
                project: appProjectName(target.projectId, target.projectSlug),
                source: {
                    repoURL: target.applicationsRepoUrl,
                    targetRevision: "{{ .environment.slug }}",
                    path: APPLICATIONS_CHART_FOLDER,
                    helm: { releaseName: applicationSlug, valueFiles: [`../${applicationValuesPath({ slug: applicationSlug })}`] }
                },
                destination: { server: IN_CLUSTER_SERVER, namespace: "{{ .environment.namespace }}" },
                syncPolicy: { automated: AUTOMATED_SYNC, syncOptions: ["CreateNamespace=true"] }
            }
        }
    }
})

/** The environments that have a branch in the applications repository: the only ones an application can be on */
const branchedEnvironments = (target: ArgoCdProjectTarget) => target.environments.filter(environment => target.applicationBranches?.includes(environment.slug))

/** The ApplicationSets of the services and frontends, one each, when the project has an applications repository */
export const buildApplicationSets = (target: ArgoCdProjectTarget) => {
    const { applicationsRepoUrl } = target
    if (!applicationsRepoUrl) return []
    return (target.applications ?? []).map(slug => buildApplicationSet({ ...target, applicationsRepoUrl }, slug, branchedEnvironments(target)))
}

/**
 * Everything Argo CD should hold for the project: the ApplicationSet of the environments when there is a
 * configuration repository, one per service and frontend when there is an applications one.
 * `environmentApplications` and `applications` are the names Argo CD will give the Applications they generate.
 */
export const buildArgoCdState = (target: ArgoCdProjectTarget) => {
    const { configurationRepoUrl, applicationsRepoUrl } = target
    return {
        appProject: buildAppProject(target),
        environmentApplications: configurationRepoUrl ? target.environments.map(environment => environmentApplicationName(target.projectId, target.projectSlug, environment.slug)) : [],
        applicationSets: [...(configurationRepoUrl ? [buildEnvironmentsApplicationSet({ ...target, configurationRepoUrl })] : []), ...buildApplicationSets(target)],
        applications: applicationsRepoUrl
            ? (target.applications ?? []).flatMap(slug => branchedEnvironments(target).map(environment => applicationName(target.projectId, target.projectSlug, slug, environment.slug)))
            : []
    }
}

/** A name two objects of the project would both take: two ApplicationSets, or two Applications, fight over it */
export const clashingName = (state: ReturnType<typeof buildArgoCdState>): string | undefined => {
    const repeated = (names: string[]) => names.find((name, index) => names.indexOf(name) !== index)
    return repeated(state.applicationSets.map(applicationSet => applicationSet.metadata.name)) ?? repeated([...state.environmentApplications, ...state.applications])
}
