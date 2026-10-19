import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Spinner, Textarea } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { AlertTriangle, ArrowLeft, LayoutDashboard, Plus, Server, Sparkles } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import AssistantJobThread, { jobErrorMessage, POLL_INTERVAL_MS, PROMPT_MAX_LENGTH } from "@/components/assistant/AssistantJobThread"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useAiJobsApi, { AiJob, isAiJobActive } from "@/hooks/apiClients/useAiJobsApi"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import type { AssistantJobTab } from "@/store/useAssistantJobsStore"
import useProjectStore from "@/store/useProjectStore"
import useThemeStore from "@/store/useThemeStore"
import { cn } from "@/utils/styleUtils"

/** Mirrors the backend: a job works on at most this many repositories. */
const MAX_REPOSITORIES = 10

/** The value of `?job=` that opens the composer instead of a conversation. */
const NEW_JOB = "new"

/** Still moving: the agent works, or a proposal is being pushed. */
const isBusy = (job: AiJob) => isAiJobActive(job.status) || job.repositories.some(repository => repository.status === "APPLYING")

/** One conversation of the domain: its first request names it, its latest job says where it stands. */
interface Conversation {
    rootJobId: string
    first: AiJob
    latest: AiJob
}

/** The backend sends the first and the latest job of each chain, newest first: the first met of a chain is its latest, the last met its first. */
const conversationsOf = (jobs: AiJob[]): Conversation[] => {
    const byRoot = new Map<string, Conversation>()
    for (const job of jobs) {
        const known = byRoot.get(job.rootJobId)
        if (known) known.first = job
        else byRoot.set(job.rootJobId, { rootJobId: job.rootJobId, first: job, latest: job })
    }
    return [...byRoot.values()]
}

const firstLine = (text: string) =>
    text
        .split("\n")
        .find(line => line.trim().length > 0)
        ?.trim() ?? ""

const ConversationItem: React.FC<{ conversation: Conversation; selected: boolean; onSelect: () => void }> = ({ conversation, selected, onSelect }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    const { first, latest } = conversation
    const status = t(`assistant.jobs.status.${latest.status}`)
    return (
        <li>
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                aria-label={`${t("domains.ai.open_conversation", { prompt: firstLine(first.prompt) })} · ${status}`}
                onClick={onSelect}
                className={cn(
                    "flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-primary/5" : "border-divider hover:border-primary/50 hover:bg-muted/40"
                )}
            >
                <span className="line-clamp-2 break-words text-sm font-medium">{firstLine(first.prompt)}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <time dateTime={latest.updatedAt}>{format(new Date(latest.updatedAt), "PPp", { locale: themeStore.getLocale() })}</time>
                    <span>· {t("domains.ai.repositories_count", { count: latest.repositories.length })}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={latest.status === "FAILED" ? "destructive" : latest.status === "DONE" ? "accent" : "outline"}>{status}</Badge>
                    {latest.repositories.some(repository => repository.status === "PROPOSED") && <Badge variant="outline">{t("domains.ai.to_review")}</Badge>}
                </span>
            </button>
        </li>
    )
}

interface DomainRepository {
    kind: "microfrontend" | "service"
    id: string
    name: string
    linked: boolean
}

interface ComposerProps {
    domainId: string
    domainName: string
    repositories: DomainRepository[]
    onCreated: (job: AiJob) => void
}

/** The request for a new job on the whole domain: the agent sees every linked repository of it, frontend and backend. */
const Composer: React.FC<ComposerProps> = ({ domainId, domainName, repositories, onCreated }) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const [prompt, setPrompt] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const promptRef = useRef<HTMLTextAreaElement>(null)
    const promptId = useId()
    const linked = repositories.filter(repository => repository.linked)
    const unlinked = repositories.filter(repository => !repository.linked)
    const tooMany = linked.length > MAX_REPOSITORIES

    const createMutation = useMutation({
        mutationFn: () => aiJobsApi.create({ prompt: prompt.trim(), scope: "domain", domainId }, { customErrorMessage: error => jobErrorMessage(t, error, "create") }),
        onSuccess: job => {
            setPrompt("")
            setSubmitted(false)
            onCreated(job)
        }
    })

    const promptError = submitted && !prompt.trim() ? t("domains.ai.prompt_required") : undefined

    const generate = () => {
        setSubmitted(true)
        if (!prompt.trim()) {
            promptRef.current?.focus()
            return
        }
        if (linked.length === 0 || tooMany) return
        createMutation.mutate()
    }

    return (
        <form
            noValidate
            onSubmit={event => {
                event.preventDefault()
                generate()
            }}
        >
            <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
                <CardHeader>
                    <CardTitle className="mb-0 flex items-center gap-2 break-words text-xl">
                        <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
                        {t("domains.ai.composer_title", { name: domainName })}
                    </CardTitle>
                    <CardDescription>{t("domains.ai.composer_description")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pt-3">
                    <section className="flex flex-col gap-2" aria-labelledby={`${promptId}-context`}>
                        <h3 id={`${promptId}-context`} className="text-sm font-medium">
                            {t("domains.ai.context_title")}
                        </h3>
                        {linked.length === 0 ? (
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
                                                <span className="sr-only"> ({t(repository.kind === "service" ? "domains.ai.kind_service" : "domains.ai.kind_microfrontend")})</span>
                                            </Badge>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                        {unlinked.length > 0 && <p className="text-xs text-foreground-secondary">{t("domains.ai.unlinked", { names: unlinked.map(repository => repository.name).join(", ") })}</p>}
                        {tooMany && (
                            <Alert variant="destructive">
                                <AlertTriangle className="size-4" aria-hidden="true" />
                                <AlertTitle>{t("domains.ai.too_many_title")}</AlertTitle>
                                <AlertDescription>{t("domains.ai.too_many_description", { count: linked.length, max: MAX_REPOSITORIES })}</AlertDescription>
                            </Alert>
                        )}
                    </section>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={promptId} className="sr-only">
                            {t("domains.ai.prompt_label")}
                        </Label>
                        <Textarea
                            id={promptId}
                            ref={promptRef}
                            value={prompt}
                            rows={8}
                            maxLength={PROMPT_MAX_LENGTH}
                            required
                            aria-invalid={Boolean(promptError)}
                            aria-describedby={`${promptId}-hint`}
                            placeholder={t("domains.ai.prompt_placeholder")}
                            disabled={createMutation.isPending}
                            onChange={event => setPrompt(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault()
                                    generate()
                                }
                            }}
                            dataTestId="domain-ai-prompt"
                        />
                        <div id={`${promptId}-hint`} className="flex justify-between gap-2 text-xs">
                            <span className="text-destructive">{promptError}</span>
                            <span className="text-muted-foreground">{t("microfrontend.aiChange.prompt_counter", { count: prompt.length, max: PROMPT_MAX_LENGTH })}</span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{t("microfrontend.aiChange.composer_shortcut")}</span>
                        <Button type="submit" disabled={createMutation.isPending || linked.length === 0 || tooMany} dataTestId="domain-ai-generate">
                            {createMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <Sparkles aria-hidden="true" />}
                            {t("microfrontend.aiChange.generate")}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </form>
    )
}

/**
 * "Edit with AI" on a functional domain: one agent works on its frontend and its backend at once, with the
 * domain's description as context. The conversations of the domain on one side, the selected one (or a new
 * request) on the other; the selection lives in `?job=`, by the root of its chain.
 */
const DomainAiWorkspace: React.FC = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { id } = useParams<{ id: string }>()
    const [searchParams, setSearchParams] = useSearchParams()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)
    const assistantEnabled = useAssistantEnabled()
    const domainsApi = useDomainsApi()
    const microfrontendsApi = useMicrofrontendsApi()
    const servicesApi = useServicesApi()
    const aiJobsApi = useAiJobsApi()
    const linkedId = searchParams.get("job") ?? undefined

    const domainQuery = useQuery({ queryKey: ["domain", id], queryFn: () => domainsApi.getSingle(id!), enabled: !!id })
    const microfrontendsQuery = useQuery({
        queryKey: ["microfrontends-by-project-id", projectId],
        queryFn: () => microfrontendsApi.getByProjectId(projectId!),
        enabled: !!projectId
    })
    const servicesQuery = useQuery({ queryKey: ["services", projectId], queryFn: servicesApi.getAll, enabled: !!projectId })
    const jobsQueryKey = ["ai-jobs", "domain", id]
    const jobsQuery = useQuery({
        queryKey: jobsQueryKey,
        queryFn: () => aiJobsApi.list({ domainId: id! }),
        enabled: !!id && assistantEnabled,
        // Jobs started elsewhere (the assistant, a teammate) land here too: keep the list moving while one works.
        refetchInterval: query => (query.state.data?.some(isBusy) ? POLL_INTERVAL_MS * 2 : false)
    })

    const conversations = conversationsOf(jobsQuery.data ?? [])

    const select = (jobId: string) =>
        setSearchParams(
            current => {
                const next = new URLSearchParams(current)
                next.set("job", jobId)
                return next
            },
            { replace: true }
        )

    // Nothing linked: open what needs attention first, otherwise a new request.
    // biome-ignore lint/correctness/useExhaustiveDependencies: only the arrival of the list decides the default
    useEffect(() => {
        if (linkedId || !jobsQuery.data) return
        const attention = conversations.find(({ latest }) => isBusy(latest) || latest.repositories.some(repository => repository.status === "PROPOSED"))
        select(attention?.rootJobId ?? NEW_JOB)
    }, [linkedId, jobsQuery.data])

    const selectedRoot = linkedId && linkedId !== NEW_JOB ? linkedId : undefined
    const selected = conversations.find(conversation => conversation.rootJobId === selectedRoot)
    // The latest job of each chain the thread reported: a follow-up is followed before the list catches up.
    const [followed, setFollowed] = useState<Record<string, string>>({})
    const tab: AssistantJobTab | undefined = selectedRoot
        ? { rootJobId: selectedRoot, jobId: followed[selectedRoot] ?? selected?.latest._id ?? selectedRoot, repositoryCount: selected?.latest.repositories.length ?? 0 }
        : undefined

    const onLatestJob = (job: AiJob) => {
        setFollowed(current => ({ ...current, [job.rootJobId]: job._id }))
        queryClient.invalidateQueries({ queryKey: jobsQueryKey })
    }

    const domain = domainQuery.data
    const repositories: DomainRepository[] = [
        ...(microfrontendsQuery.data ?? [])
            .filter(microfrontend => microfrontend.domainId === id && microfrontend._id)
            .map(microfrontend => ({ kind: "microfrontend" as const, id: microfrontend._id!, name: microfrontend.name, linked: Boolean(microfrontend.codeRepository?.enabled) })),
        ...(servicesQuery.data ?? [])
            .filter(service => service.domainId === id && service._id)
            .map(service => ({ kind: "service" as const, id: service._id!, name: service.name, linked: Boolean(service.codeRepository?.enabled) }))
    ]

    const onCreated = (job: AiJob) => {
        queryClient.invalidateQueries({ queryKey: jobsQueryKey })
        select(job.rootJobId)
    }

    return (
        <ApiStatusHandler queries={[domainQuery, microfrontendsQuery, servicesQuery]} interceptEmpty={false}>
            {domain && (
                <SinglePageLayout
                    title={t("domains.ai.title", { name: domain.name })}
                    description={domain.description || t("domains.ai.description")}
                    left={
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/domain/${id}`)}>
                            <ArrowLeft />
                            {t("domains.ai.back")}
                        </Button>
                    }
                >
                    {!assistantEnabled ? (
                        <Alert>
                            <AlertDescription>{t("domains.ai.unavailable")}</AlertDescription>
                        </Alert>
                    ) : (
                        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                            <aside aria-label={t("domains.ai.conversations_label")} className="flex flex-col gap-4 lg:sticky lg:top-4">
                                <Button type="button" variant={linkedId === NEW_JOB ? "secondary" : "primary"} onClick={() => select(NEW_JOB)} dataTestId="domain-ai-new">
                                    <Plus aria-hidden="true" />
                                    {t("domains.ai.new_job")}
                                </Button>
                                {jobsQuery.isPending && <Spinner size={24} centerScreen={false} label={t("common.loading")} />}
                                {jobsQuery.isError && <p className="text-sm text-destructive">{t("domains.ai.load_error")}</p>}
                                {jobsQuery.data && conversations.length === 0 && <p className="text-xs text-muted-foreground">{t("domains.ai.no_conversations")}</p>}
                                {conversations.length > 0 && (
                                    <ul className="flex flex-col gap-1.5">
                                        {conversations.map(conversation => (
                                            <ConversationItem
                                                key={conversation.rootJobId}
                                                conversation={conversation}
                                                selected={conversation.rootJobId === selectedRoot}
                                                onSelect={() => select(conversation.rootJobId)}
                                            />
                                        ))}
                                    </ul>
                                )}
                            </aside>

                            <div className="min-w-0">
                                {(linkedId === NEW_JOB || !selectedRoot) && <Composer domainId={id!} domainName={domain.name} repositories={repositories} onCreated={onCreated} />}
                                {tab && projectId && (
                                    <Card className="flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col overflow-hidden">
                                        {/* Keyed by chain: the thread keeps the state of the one it shows. */}
                                        <AssistantJobThread key={tab.rootJobId} projectId={projectId} tab={tab} onLatestJob={onLatestJob} />
                                    </Card>
                                )}
                            </div>
                        </div>
                    )}
                </SinglePageLayout>
            )}
        </ApiStatusHandler>
    )
}

export default DomainAiWorkspace
