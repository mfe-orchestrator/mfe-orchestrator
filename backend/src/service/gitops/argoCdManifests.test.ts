import { describe, expect, it } from "vitest"
import {
    applicationSetName,
    appProjectName,
    buildApplicationSet,
    buildAppProject,
    buildArgoCdState,
    buildEnvironmentsApplicationSet,
    COMPONENT_LABEL,
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
    environments: [development, production]
}
const PROJECT_NAME = appProjectName(projectId, "shop")
/** A DNS label, or dot-separated labels as an Application name may be */
const DNS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/

describe("names", () => {
    it("given a project, when its AppProject is named, then it is the slug and a hash of the id, without dots", () => {
        expect(PROJECT_NAME).toMatch(/^mfe-shop-[0-9a-f]{6}$/)
    })

    it("given an environment, when its objects are named, then the parts are separated by dots", () => {
        expect(environmentApplicationName(projectId, "shop", "production")).toBe(`${PROJECT_NAME}.production`)
        expect(environmentsApplicationSetName(projectId, "shop")).toBe(`${PROJECT_NAME}.environments`)
        expect(applicationSetName(projectId, "shop", "production")).toBe(`${PROJECT_NAME}.production.applications`)
    })

    it("given two projects whose slug and environment join the same way, when they are named, then the names differ", () => {
        const other = "64b000000000000000000002"

        expect(environmentApplicationName(projectId, "shop-eu", "prod")).not.toBe(environmentApplicationName(other, "shop", "eu-prod"))
        expect(environmentApplicationName(projectId, "shop-eu", "prod")).not.toBe(environmentApplicationName(projectId, "shop", "eu-prod"))
    })

    it("given slugs with characters Kubernetes refuses or too long, when they are named, then the names are valid and fit 63", () => {
        const names = [
            appProjectName(projectId, `My_Shop ${"a".repeat(80)}`),
            environmentApplicationName(projectId, "a".repeat(80), "B".repeat(63)),
            applicationSetName(projectId, "shop", "x".repeat(63))
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
    const applicationSet = buildApplicationSet(target, production)
    const templateName = applicationSet.spec.template.metadata.name

    it("given an environment, when its ApplicationSet is built, then the git generator reads the values files of the branch and leaves the chart out", () => {
        expect(applicationSet.metadata.name).toBe(applicationSetName(projectId, "shop", "production"))
        expect(applicationSet.spec.goTemplate).toBe(true)
        expect(applicationSet.spec.goTemplateOptions).toEqual(["missingkey=error"])
        expect(applicationSet.spec.generators).toEqual([
            {
                git: {
                    repoURL: target.applicationsRepoUrl,
                    revision: "production",
                    files: [{ path: "*.yaml" }, { path: "microservice-chart/**", exclude: true }]
                }
            }
        ])
    })

    it("given an environment, when its ApplicationSet is built, then it never deletes the applications it generated", () => {
        expect(applicationSet.spec.syncPolicy).toEqual({ applicationsSync: "create-update" })
    })

    it("given an environment, when its ApplicationSet is built, then a generated application can never take the name of the Application of the environment", () => {
        expect(templateName.startsWith(`${PROJECT_NAME}.production.app.`)).toBe(true)
        expect(environmentApplicationName(projectId, "shop", "production").startsWith(`${PROJECT_NAME}.production.app.`)).toBe(false)
    })

    it("given an environment, when its ApplicationSet is built, then the slug in the name of a generated application is cut and hashed past what fits 63", () => {
        const budget = 63 - `${PROJECT_NAME}.production.app.`.length

        expect(templateName).toContain('{{ $slug := trimSuffix ".yaml" .path.filename | lower }}')
        expect(templateName).toContain(`{{ if le (len $slug) 26 }}{{ $slug }}{{ else }}{{ trunc 19 $slug | trimSuffix "-" }}-{{ sha256sum $slug | trunc 6 }}{{ end }}`)
        expect(budget).toBeGreaterThanOrEqual(26)
    })

    it("given an environment, when its ApplicationSet is built, then each application installs the chart of the branch with its own values file", () => {
        expect(applicationSet.spec.template.metadata.labels).toMatchObject({ [PROJECT_ID_LABEL]: projectId, [COMPONENT_LABEL]: "application" })
        expect(applicationSet.spec.template.spec).toEqual({
            project: PROJECT_NAME,
            source: {
                repoURL: target.applicationsRepoUrl,
                targetRevision: "production",
                path: "microservice-chart",
                helm: { releaseName: '{{ trimSuffix ".yaml" .path.filename }}', valueFiles: ["../{{ .path.filename }}"] }
            },
            destination: { server: IN_CLUSTER_SERVER, namespace: "prod" },
            syncPolicy: { automated: { prune: true, selfHeal: true }, syncOptions: ["CreateNamespace=true"] }
        })
    })
})

describe("buildArgoCdState", () => {
    it("given both repositories, when the state is built, then there is the ApplicationSet of the environments and one per environment", () => {
        const state = buildArgoCdState(target)

        expect(state.appProject.metadata.name).toBe(PROJECT_NAME)
        expect(state.environmentApplications).toEqual([environmentApplicationName(projectId, "shop", "development"), environmentApplicationName(projectId, "shop", "production")])
        expect(state.applicationSets.map(applicationSet => applicationSet.metadata.name)).toEqual([
            environmentsApplicationSetName(projectId, "shop"),
            applicationSetName(projectId, "shop", "development"),
            applicationSetName(projectId, "shop", "production")
        ])
    })

    it("given no applications repository, when the state is built, then the ApplicationSet of the environments is the only one", () => {
        expect(buildArgoCdState({ ...target, applicationsRepoUrl: undefined }).applicationSets.map(applicationSet => applicationSet.metadata.name)).toEqual([environmentsApplicationSetName(projectId, "shop")])
    })

    it("given an environment slug in uppercase, when the state is built, then the names are lowercase and the branch and the folders keep the slug", () => {
        const state = buildArgoCdState({ ...target, environments: [{ slug: "DEV", namespace: "dev" }] })
        const [environments, applications] = state.applicationSets

        expect(state.environmentApplications).toEqual([`${PROJECT_NAME}.dev`])
        expect(environments.spec.generators[0].list?.elements).toEqual([{ name: `${PROJECT_NAME}.dev`, slug: "DEV", namespace: "dev" }])
        expect(applications.spec.generators[0].git?.revision).toBe("DEV")
        expect(applications.spec.template.metadata.name.startsWith(`${PROJECT_NAME}.dev.app.`)).toBe(true)
    })

    it("given no configuration repository, when the state is built, then there is no ApplicationSet of the environments", () => {
        const state = buildArgoCdState({ ...target, configurationRepoUrl: undefined })

        expect(state.environmentApplications).toEqual([])
        expect(state.applicationSets.map(applicationSet => applicationSet.metadata.name)).toEqual([applicationSetName(projectId, "shop", "development"), applicationSetName(projectId, "shop", "production")])
    })
})
