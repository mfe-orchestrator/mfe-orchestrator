import { describe, expect, it } from "vitest"
import {
    applicationSetName,
    appProjectName,
    buildApplicationSet,
    buildAppProject,
    buildArgoCdState,
    buildConfigurationApplication,
    COMPONENT_LABEL,
    configurationApplicationName,
    IN_CLUSTER_SERVER,
    MANAGED_BY_LABEL,
    PROJECT_ID_LABEL
} from "./argoCdManifests"

const development = { slug: "development", namespace: "development", manifestsGlob: "{namespaces/development.yaml,configMaps/development/*.yaml,secrets/development/*.yaml}" }
const production = { slug: "production", namespace: "prod", manifestsGlob: "{namespaces/production.yaml,configMaps/production/*.yaml,secrets/production/*.yaml}" }
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
        expect(configurationApplicationName(projectId, "shop", "production")).toBe(`${PROJECT_NAME}.production.config`)
        expect(applicationSetName(projectId, "shop", "production")).toBe(`${PROJECT_NAME}.production.applications`)
    })

    it("given two projects whose slug and environment join the same way, when they are named, then the names differ", () => {
        const other = "64b000000000000000000002"

        expect(configurationApplicationName(projectId, "shop-eu", "prod")).not.toBe(configurationApplicationName(other, "shop", "eu-prod"))
        expect(configurationApplicationName(projectId, "shop-eu", "prod")).not.toBe(configurationApplicationName(projectId, "shop", "eu-prod"))
    })

    it("given slugs with characters Kubernetes refuses or too long, when they are named, then the names are valid and fit 63", () => {
        const names = [
            appProjectName(projectId, `My_Shop ${"a".repeat(80)}`),
            configurationApplicationName(projectId, "a".repeat(80), "B".repeat(63)),
            applicationSetName(projectId, "shop", "x".repeat(63))
        ]

        for (const name of names) {
            expect(name.length).toBeLessThanOrEqual(63)
            expect(name).toMatch(DNS_NAME)
        }
    })

    it("given two long environments that differ after the cut, when they are named, then they stay apart", () => {
        expect(configurationApplicationName(projectId, "shop", `${"a".repeat(60)}-1`)).not.toBe(configurationApplicationName(projectId, "shop", `${"a".repeat(60)}-2`))
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

describe("buildConfigurationApplication", () => {
    const application = buildConfigurationApplication(target, production)

    it("given an environment, when its configuration Application is built, then it is labelled after the project and the environment", () => {
        expect(application.metadata.name).toBe(configurationApplicationName(projectId, "shop", "production"))
        expect(application.metadata.labels).toMatchObject({ [PROJECT_ID_LABEL]: projectId, [COMPONENT_LABEL]: "configuration" })
    })

    it("given an environment, when its configuration Application is built, then it syncs only the manifests of the environment into its namespace", () => {
        expect(application.spec).toEqual({
            project: PROJECT_NAME,
            source: { repoURL: target.configurationRepoUrl, targetRevision: "HEAD", path: ".", directory: { recurse: true, include: production.manifestsGlob } },
            destination: { server: IN_CLUSTER_SERVER, namespace: "prod" },
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

    it("given an environment, when its ApplicationSet is built, then a generated application can never take the name of the configuration Application", () => {
        expect(templateName.startsWith(`${PROJECT_NAME}.production.app.`)).toBe(true)
        expect(configurationApplicationName(projectId, "shop", "production").startsWith(`${PROJECT_NAME}.production.app.`)).toBe(false)
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
    it("given both repositories, when the state is built, then each environment has a configuration Application and an ApplicationSet", () => {
        const state = buildArgoCdState(target)

        expect(state.appProject.metadata.name).toBe(PROJECT_NAME)
        expect(state.applications.map(application => application.metadata.name)).toEqual([
            configurationApplicationName(projectId, "shop", "development"),
            configurationApplicationName(projectId, "shop", "production")
        ])
        expect(state.applicationSets.map(applicationSet => applicationSet.metadata.name)).toEqual([
            applicationSetName(projectId, "shop", "development"),
            applicationSetName(projectId, "shop", "production")
        ])
    })

    it("given no applications repository, when the state is built, then there is no ApplicationSet", () => {
        expect(buildArgoCdState({ ...target, applicationsRepoUrl: undefined }).applicationSets).toEqual([])
    })

    it("given an environment slug in uppercase, when the state is built, then the names are lowercase and the branch and the folders keep the slug", () => {
        const environment = { slug: "DEV", namespace: "dev", manifestsGlob: "{namespaces/DEV.yaml,configMaps/DEV/*.yaml,secrets/DEV/*.yaml}" }
        const state = buildArgoCdState({ ...target, environments: [environment] })

        expect(state.applications[0].metadata.name).toBe(`${PROJECT_NAME}.dev.config`)
        expect(state.applications[0].spec.source.directory.include).toBe(environment.manifestsGlob)
        expect(state.applicationSets[0].spec.generators[0].git.revision).toBe("DEV")
        expect(state.applicationSets[0].spec.template.metadata.name.startsWith(`${PROJECT_NAME}.dev.app.`)).toBe(true)
    })

    it("given no configuration repository, when the state is built, then there is no configuration Application", () => {
        expect(buildArgoCdState({ ...target, configurationRepoUrl: undefined }).applications).toEqual([])
    })
})
