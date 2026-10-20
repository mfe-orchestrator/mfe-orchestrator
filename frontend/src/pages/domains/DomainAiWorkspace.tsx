import { Alert, AlertDescription, AlertTitle, Spinner } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AlertTriangle, LayoutDashboard, Server } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import AiWorkspace from "@/components/ai-workspace/AiWorkspace"
import { jobErrorMessage } from "@/components/assistant/AssistantJobThread"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import { Badge } from "@/components/atoms"
import useAiJobsApi, { AiJob, DomainPlan } from "@/hooks/apiClients/useAiJobsApi"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"
import DomainHeader from "./partials/DomainHeader"
import DomainScaffoldDialog, { repositoryNameFor, ScaffoldItem } from "./partials/DomainScaffoldDialog"

/** Mirrors the backend: a job works on at most this many repositories. */
const MAX_REPOSITORIES = 10

interface DomainRepository {
    kind: "microfrontend" | "service"
    id: string
    name: string
    slug: string
    /** Market slug of the template it was created from: the one its repository is scaffolded with when it has none. */
    template?: string
    linked: boolean
}

/** The rows of the creation dialog for what the AI proposes in an empty domain. */
const planItems = (plan: DomainPlan): ScaffoldItem[] => [
    ...plan.microfrontends.map((component, index) => ({ ...component, key: `microfrontend-${index}`, kind: "microfrontend" as const })),
    ...plan.services.map((component, index) => ({ ...component, key: `service-${index}`, kind: "service" as const }))
]

/** The rows of the creation dialog for members without a repository: one each, named after its slug. */
const memberItems = (repositories: DomainRepository[]): ScaffoldItem[] =>
    repositories.map(repository => ({
        key: `${repository.kind}-${repository.id}`,
        kind: repository.kind,
        memberId: repository.id,
        name: repository.name,
        slug: repository.slug,
        repositoryName: repositoryNameFor(repository.slug, repository.kind),
        template: repository.template ?? ""
    }))

/** Above the prompt: the repositories the agent sees, frontend and backend, and why some are left out. */
const DomainRepositoriesContext: React.FC<{ repositories: DomainRepository[] }> = ({ repositories }) => {
    const { t } = useTranslation()
    const headingId = useId()
    const linked = repositories.filter(repository => repository.linked)
    const unlinked = repositories.filter(repository => !repository.linked)

    return (
        <section className="flex flex-col gap-2" aria-labelledby={headingId}>
            <h3 id={headingId} className="text-sm font-medium">
                {t("domains.ai.context_title")}
            </h3>
            {repositories.length === 0 ? (
                <p className="text-sm text-foreground-secondary">{t("domains.ai.no_members")}</p>
            ) : linked.length === 0 ? (
                <p className="text-sm text-foreground-secondary">{t("domains.ai.no_repositories")}</p>
            ) : (
                <ul className="flex flex-wrap gap-2">
                    {linked.map(repository => {
                        const Icon = repository.kind === "service" ? Server : LayoutDashboard
                        return (
                            <li key={repository.id}>
                                <Badge variant="outline">
                                    <Icon className="size-3" aria-hidden="true" />
                                    {repository.name}
                                    <span className="sr-only"> ({t(`microfrontend.aiChange.kind.${repository.kind}`)})</span>
                                </Badge>
                            </li>
                        )
                    })}
                </ul>
            )}
            {linked.length > 0 && unlinked.length > 0 && (
                <p className="text-xs text-foreground-secondary">{t("domains.ai.unlinked", { names: unlinked.map(repository => repository.name).join(", ") })}</p>
            )}
            {linked.length > MAX_REPOSITORIES && (
                <Alert variant="destructive">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    <AlertTitle>{t("domains.ai.too_many_title")}</AlertTitle>
                    <AlertDescription>{t("domains.ai.too_many_description", { count: linked.length, max: MAX_REPOSITORIES })}</AlertDescription>
                </Alert>
            )}
        </section>
    )
}

interface ScaffoldState {
    open: boolean
    items: ScaffoldItem[]
    prompt: string
    /** Hands the job created once everything exists back to the workspace, which opens it. */
    started?: (job: AiJob) => void
}

/**
 * The landing screen of a functional domain: Edit with AI, the same workspace as a microfrontend's and a service's,
 * on every repository of the domain at once. With nothing to work on yet, Generate first offers to create it: the
 * components the AI proposes for an empty domain, or the repositories of members that have none.
 */
const DomainAiWorkspace: React.FC = () => {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const projectId = useProjectStore(state => state.project?._id)
    const assistantEnabled = useAssistantEnabled()
    const domainsApi = useDomainsApi()
    const microfrontendsApi = useMicrofrontendsApi()
    const servicesApi = useServicesApi()
    const aiJobsApi = useAiJobsApi()
    const [scaffold, setScaffold] = useState<ScaffoldState>({ open: false, items: [], prompt: "" })

    const domainQuery = useQuery({ queryKey: ["domain", id], queryFn: () => domainsApi.getSingle(id!), enabled: !!id })
    const microfrontendsQuery = useQuery({
        queryKey: ["microfrontends-by-project-id", projectId],
        queryFn: () => microfrontendsApi.getByProjectId(projectId!),
        enabled: !!projectId
    })
    const servicesQuery = useQuery({ queryKey: ["services", projectId], queryFn: servicesApi.getAll, enabled: !!projectId })

    const planMutation = useMutation({
        mutationFn: (prompt: string) => aiJobsApi.planDomain({ domainId: id!, prompt }, { customErrorMessage: error => jobErrorMessage(t, error, "plan") })
    })

    // Not an ApiStatusHandler: it unmounts its children on every background refetch, and the workspace holds a draft prompt.
    const queries = [domainQuery, microfrontendsQuery, servicesQuery]
    if (queries.some(query => query.isPending)) {
        return (
            <div className="flex min-h-[200px] items-center justify-center">
                <Spinner size={32} />
            </div>
        )
    }

    // Only a first load that failed: a background refetch that fails keeps what was loaded, and the draft with it.
    const failed = queries.find(query => query.isLoadingError)
    if (failed || !domainQuery.data) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{failed?.error instanceof Error ? failed.error.message : t("app.error.generic")}</AlertDescription>
            </Alert>
        )
    }

    const domain = domainQuery.data
    const repositories: DomainRepository[] = [
        ...(microfrontendsQuery.data ?? [])
            .filter(microfrontend => microfrontend.domainId === id && microfrontend._id)
            .map(microfrontend => ({
                kind: "microfrontend" as const,
                id: microfrontend._id!,
                name: microfrontend.name,
                slug: microfrontend.slug,
                template: microfrontend.template,
                linked: Boolean(microfrontend.codeRepository?.enabled)
            })),
        ...(servicesQuery.data ?? [])
            .filter(service => service.domainId === id && service._id)
            .map(service => ({
                kind: "service" as const,
                id: service._id!,
                name: service.name,
                slug: service.slug,
                template: service.template,
                linked: Boolean(service.codeRepository?.enabled)
            }))
    ]
    const linked = repositories.filter(repository => repository.linked)

    // Nothing to work on yet: create it first, then the dialog starts the job.
    const intercept = (prompt: string, started: (job: AiJob) => void) => {
        if (repositories.length === 0) {
            planMutation.mutate(prompt, { onSuccess: plan => setScaffold({ open: true, items: planItems(plan), prompt, started }) })
            return true
        }
        if (linked.length === 0) {
            setScaffold({ open: true, items: memberItems(repositories), prompt, started })
            return true
        }
        return false
    }

    return (
        <div className="flex min-h-full flex-col gap-6">
            <DomainHeader domain={domain} active="ai" />
            {assistantEnabled ? (
                // Keyed: the route instance is reused across domains, and a draft must not follow the user to another one.
                <AiWorkspace
                    key={id}
                    target={{ kind: "domain", id: id! }}
                    name={domain.name}
                    composer={{
                        context: <DomainRepositoriesContext repositories={repositories} />,
                        blocked: linked.length > MAX_REPOSITORIES,
                        pending: planMutation.isPending,
                        pendingLabel: t("domains.ai.planning"),
                        intercept
                    }}
                />
            ) : (
                <Alert>
                    <AlertDescription>{t("domains.ai.unavailable")}</AlertDescription>
                </Alert>
            )}
            <DomainScaffoldDialog
                open={scaffold.open}
                onOpenChange={open => setScaffold(current => ({ ...current, open }))}
                domainId={id!}
                domainName={domain.name}
                prompt={scaffold.prompt}
                items={scaffold.items}
                maxRepositories={MAX_REPOSITORIES}
                onCreated={job => scaffold.started?.(job)}
            />
        </div>
    )
}

export default DomainAiWorkspace
