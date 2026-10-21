import { describe, expect, it } from "vitest"
import {
    APPLICATION_LABEL,
    applicationName,
    applicationSetName,
    appProjectName,
    buildApplicationSet,
    buildAppProject,
    buildArgoCdState,
    buildEnvironmentsApplicationSet,
    COMPONENT_LABEL,
    clashingName,
    ENVIRONMENT_LABEL,
    environmentApplicationName,
    environmentsApplicationSetName,
    IN_CLUSTER_SERVER,
    MANAGED_BY_LABEL,
    PROJECT_ID_LABEL
} from "./argoCdManifests"

const development = { slug: "development", namespace: "development" }
const production = { slug: "production", namespace: "prod" }
const projectId = "64b000000000000000000001"
const target = {
    projectId,
    projectSlug: "shop",
    configurationRepoUrl: "https://gitlab.example.com/acme/shop-config.git",
    applicationsRepoUrl: "https://github.com/acme/shop-apps.git",
    environments: [development, production],
    applications: ["orders", "checkout"],
    applicationBranches: ["main", "development", "production"]
}
const PROJECT_NAME = appProjectName(projectId, "shop")
/** A DNS label, or dot-separated labels as an Application name may be */
const DNS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

describe("names", () => {
    it("given a project, when its AppProject is named, then it is the slug and a hash of the id", () => {
        expect(PROJECT_NAME).toMatch(/^shop-[0-9a-f]{6}$/)
    })

    it("given an environment, when its objects are named, then they are the project slug, the parts and the hash of the project", () => {
        const hash = PROJECT_NAME.slice(-6)

        expect(environmentApplicationName(projectId, "shop", "production")).toBe(`shop-production-${hash}`)
        expect(environmentsApplicationSetName(projectId, "shop")).toBe(`shop-environments-${hash}`)
        expect(applicationSetName(projectId, "shop", "orders")).toBe(`shop-orders-${hash}`)
        expect(applicationName(projectId, "shop", "orders", "production")).toBe(`shop-orders-production-${hash}`)
    })

    it("given two projects whose slug and environment join the same way, when they are named, then the names differ", () => {
        const other = "64b000000000000000000002"

        expect(environmentApplicationName(projectId, "shop-eu", "prod")).not.toBe(environmentApplicationName(other, "shop", "eu-prod"))
    })

    it("given slugs with characters Kubernetes refuses or too long, when they are named, then the names are valid and fit 63", () => {
        const names = [
            appProjectName(projectId, `My_Shop ${"a".repeat(80)}`),
            environmentApplicationName(projectId, "a".repeat(80), "B".repeat(63)),
            applicationSetName(projectId, "shop", "x".repeat(63)),
            applicationName(projectId, "shop", "Orders_API", "y".repeat(63))
        ]

        for (const name of names) {
            expect(name.length).toBeLessThanOrEqual(63)
            expect(name).toMatch(DNS_NAME)
        }
    })

    it("given two long environments that differ after the cut, when they are named, then they stay apart", () => {
        expect(environmentApplicationName(projectId, "shop", `${"a".repeat(60)}-1`)).not.toBe(environmentApplicationName(projectId, "shop", `${"a".repeat(60)}-2`))
    })
})

describe("buildAppProject", () => {
    it("given a project, when its AppProject is built, then it carries the labels of the project", () => {
        expect(buildAppProject(target).metadata).toEqual({ name: PROJECT_NAME, labels: { [MANAGED_BY_LABEL]: "mfe-orchestrator", [PROJECT_ID_LABEL]: projectId } })
    })

    it("given two repositories and two environments, when its AppProject is built, then it reads the repositories and writes the namespaces in cluster only", () => {
        const { spec } = buildAppProject(target)

        expect(spec.sourceRepos).toEqual([target.configurationRepoUrl, target.applicationsRepoUrl])
        expect(spec.destinations).toEqual([
            { server: IN_CLUSTER_SERVER, namespace: "development" },
            { server: IN_CLUSTER_SERVER, namespace: "prod" }
        ])
        expect(spec.clusterResourceWhitelist).toEqual([{ group: "", kind: "Namespace" }])
    })

    it("given no applications repository, when its AppProject is built, then it reads the configuration repository only", () => {
        expect(buildAppProject({ ...target, applicationsRepoUrl: undefined }).spec.sourceRepos).toEqual([target.configurationRepoUrl])
    })
})

describe("buildEnvironmentsApplicationSet", () => {
    const applicationSet = buildEnvironmentsApplicationSet(target)

    it("given a project, when the ApplicationSet of its environments is built, then it is one for the project, labelled after it", () => {
        expect(applicationSet.metadata.name).toBe(environmentsApplicationSetName(projectId, "shop"))
        expect(applicationSet.metadata.labels).toEqual({ [MANAGED_BY_LABEL]: "mfe-orchestrator", [PROJECT_ID_LABEL]: projectId, [COMPONENT_LABEL]: "configuration" })
    })

    it("given two environments, when the ApplicationSet is built, then it lists them, not the repository, with the name, folder and namespace of each", () => {
        expect(applicationSet.spec.generators).toEqual([
            {
                list: {
                    elements: [
                        { name: environmentApplicationName(projectId, "shop", "development"), slug: "development", namespace: "development" },
                        { name: environmentApplicationName(projectId, "shop", "production"), slug: "production", namespace: "prod" }
                    ]
                }
            }
        ])
    })

    it("given an environment that leaves the list, when Argo CD deletes its Application, then what it deployed stays", () => {
        expect(applicationSet.spec.syncPolicy).toEqual({ preserveResourcesOnDeletion: true })
    })

    it("given an environment, when its Application is generated, then it syncs the folder of the environment from the configuration repository into its namespace", () => {
        expect(applicationSet.spec.template.metadata).toEqual({
            name: "{{ .name }}",
            labels: { [MANAGED_BY_LABEL]: "mfe-orchestrator", [PROJECT_ID_LABEL]: projectId, [ENVIRONMENT_LABEL]: "{{ .slug }}", [COMPONENT_LABEL]: "environment" }
        })
        expect(applicationSet.spec.template.spec).toEqual({
            project: PROJECT_NAME,
            source: { repoURL: target.configurationRepoUrl, targetRevision: "HEAD", path: "{{ .slug }}", directory: { recurse: true } },
            destination: { server: IN_CLUSTER_SERVER, namespace: "{{ .namespace }}" },
            syncPolicy: { automated: { prune: true, selfHeal: true } }
        })
    })
})

describe("buildApplicationSet", () => {
    const applicationSet = buildApplicationSet(target, "orders", [development, production])
    const [list, git] = (applicationSet.spec.generators[0] as { matrix: { generators: [{ list: { elements: unknown[] } }, { git: unknown }] } }).matrix.generators

    it("given a service, when its ApplicationSet is built, then it is named after it and labelled with its slug", () => {
        expect(applicationSet.metadata.name).toBe(applicationSetName(projectId, "shop", "orders"))
        expect(applicationSet.metadata.labels).toEqual({ [MANAGED_BY_LABEL]: "mfe-orchestrator", [PROJECT_ID_LABEL]: projectId, [APPLICATION_LABEL]: "orders", [COMPONENT_LABEL]: "applications" })
        expect(applicationSet.spec.goTemplate).toBe(true)
        expect(applicationSet.spec.goTemplateOptions).toEqual(["missingkey=error"])
    })

    it("given two environments, when the ApplicationSet is built, then it lists them under a key of their own, with the name of the Application of each", () => {
        expect(list.list.elements).toEqual([
            { environment: { name: applicationName(projectId, "shop", "orders", "development"), slug: "development", namespace: "development" } },
            { environment: { name: applicationName(projectId, "shop", "orders", "production"), slug: "production", namespace: "prod" } }
        ])
    })

    it("given a listed environment, when the ApplicationSet is built, then the git generator looks for the values file of the service on its branch only", () => {
        expect(git).toEqual({ git: { repoURL: target.applicationsRepoUrl, revision: "{{ .environment.slug }}", files: [{ path: "orders.yaml" }] } })
    })

    it("given a service, when its ApplicationSet is built, then it never deletes the applications it generated", () => {
        expect(applicationSet.spec.syncPolicy).toEqual({ applicationsSync: "create-update" })
    })

    it("given an environment, when its Application is generated, then it installs the chart of the branch with the values file of the service in the namespace of the environment", () => {
        expect(applicationSet.spec.template.metadata).toEqual({
            name: "{{ .environment.name }}",
            labels: {
                [MANAGED_BY_LABEL]: "mfe-orchestrator",
                [PROJECT_ID_LABEL]: projectId,
                [APPLICATION_LABEL]: "orders",
                [ENVIRONMENT_LABEL]: "{{ .environment.slug }}",
                [COMPONENT_LABEL]: "application"
            }
        })
        expect(applicationSet.spec.template.spec).toEqual({
            project: PROJECT_NAME,
            source: {
                repoURL: target.applicationsRepoUrl,
                targetRevision: "{{ .environment.slug }}",
                path: "microservice-chart",
                helm: { releaseName: "orders", valueFiles: ["../orders.yaml"] }
            },
            destination: { server: IN_CLUSTER_SERVER, namespace: "{{ .environment.namespace }}" },
            syncPolicy: { automated: { prune: true, selfHeal: true }, syncOptions: ["CreateNamespace=true"] }
        })
    })
})

describe("buildArgoCdState", () => {
    const environmentsOf = (applicationSet: { spec: { generators: unknown[] } }) =>
        (applicationSet.spec.generators[0] as { matrix: { generators: [{ list: { elements: Array<{ environment: { slug: string } }> } }] } }).matrix.generators[0].list.elements.map(
            element => element.environment.slug
        )

    it("given both repositories, when the state is built, then there is the ApplicationSet of the environments and one per service", () => {
        const state = buildArgoCdState(target)

        expect(state.appProject.metadata.name).toBe(PROJECT_NAME)
        expect(state.environmentApplications).toEqual([environmentApplicationName(projectId, "shop", "development"), environmentApplicationName(projectId, "shop", "production")])
        expect(state.applicationSets.map(applicationSet => applicationSet.metadata.name)).toEqual([
            environmentsApplicationSetName(projectId, "shop"),
            applicationSetName(projectId, "shop", "orders"),
            applicationSetName(projectId, "shop", "checkout")
        ])
        expect(state.applications).toEqual([
            applicationName(projectId, "shop", "orders", "development"),
            applicationName(projectId, "shop", "orders", "production"),
            applicationName(projectId, "shop", "checkout", "development"),
            applicationName(projectId, "shop", "checkout", "production")
        ])
    })

    it("given an environment whose branch is not there yet, when the state is built, then the ApplicationSets leave it out", () => {
        const [, orders] = buildArgoCdState({ ...target, applicationBranches: ["main", "development"] }).applicationSets

        expect(environmentsOf(orders)).toEqual(["development"])
    })

    it("given no applications repository, when the state is built, then the ApplicationSet of the environments is the only one", () => {
        const state = buildArgoCdState({ ...target, applicationsRepoUrl: undefined })

        expect(state.applicationSets.map(applicationSet => applicationSet.metadata.name)).toEqual([environmentsApplicationSetName(projectId, "shop")])
        expect(state.applications).toEqual([])
    })

    it("given an environment slug in uppercase, when the state is built, then the names are lowercase and the branch and the folders keep the slug", () => {
        const state = buildArgoCdState({ ...target, environments: [{ slug: "DEV", namespace: "dev" }], applications: ["orders"], applicationBranches: ["DEV"] })
        const [environments, orders] = state.applicationSets

        expect(state.environmentApplications).toEqual([environmentApplicationName(projectId, "shop", "dev")])
        expect((environments.spec.generators[0] as { list?: { elements: unknown } }).list?.elements).toEqual([
            { name: environmentApplicationName(projectId, "shop", "dev"), slug: "DEV", namespace: "dev" }
        ])
        expect(environmentsOf(orders)).toEqual(["DEV"])
        expect(state.applications).toEqual([applicationName(projectId, "shop", "orders", "dev")])
    })

    it("given no configuration repository, when the state is built, then there is no ApplicationSet of the environments", () => {
        const state = buildArgoCdState({ ...target, configurationRepoUrl: undefined })

        expect(state.environmentApplications).toEqual([])
        expect(state.applicationSets.map(applicationSet => applicationSet.metadata.name)).toEqual([applicationSetName(projectId, "shop", "orders"), applicationSetName(projectId, "shop", "checkout")])
    })
})

describe("clashingName", () => {
    it("given distinct slugs, when the names are checked, then none clashes", () => {
        expect(clashingName(buildArgoCdState(target))).toBeUndefined()
    })

    it("given a service and an environment whose slugs join the same way as another pair, when the names are checked, then the name they share comes back", () => {
        const state = buildArgoCdState({
            ...target,
            environments: [
                { slug: "dev", namespace: "dev" },
                { slug: "api-dev", namespace: "api-dev" }
            ],
            applications: ["orders-api", "orders"],
            applicationBranches: ["dev", "api-dev"]
        })

        expect(clashingName(state)).toBe(applicationName(projectId, "shop", "orders", "api-dev"))
    })

    it("given a service named environments, when the names are checked, then its ApplicationSet clashes with the one of the environments", () => {
        expect(clashingName(buildArgoCdState({ ...target, applications: ["environments"] }))).toBe(environmentsApplicationSetName(projectId, "shop"))
    })
})
