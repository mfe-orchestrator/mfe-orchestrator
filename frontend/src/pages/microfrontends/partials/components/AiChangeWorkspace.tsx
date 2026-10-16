import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Spinner, Textarea } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AxiosError } from "axios"
import { format } from "date-fns"
import { AlertTriangle, Archive, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, ExternalLink, GitBranch, LoaderCircle, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import AnswerUsage from "@/components/assistant/AnswerUsage"
import type { IBadgeProps } from "@/components/atoms"
import { Badge, Button } from "@/components/atoms"
import useAiChangesApi, { AI_CHANGE_ACTIVE_STATUSES, AiChangeFile, AiChangeRequest, AiChangeStatus } from "@/hooks/apiClients/useAiChangesApi"
import { errorCodeOf } from "@/hooks/useApiClient"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { cn } from "@/utils/styleUtils"
import { AiChangeDiff } from "./AiChangeDiff"
import { ProgressLog, StatusBadge } from "./AiChangeProgress"

const PROMPT_MAX_LENGTH = 8000
const POLL_INTERVAL_MS = 2000

/** Error codes of the create endpoint that have a message of their own. */
const CREATE_ERROR_CODES = new Set(["ASSISTANT_DISABLED", "AI_CHANGE_FORBIDDEN", "WORKSPACE_NO_REPOSITORY"])

const ACTION_VARIANT: Record<AiChangeFile["action"], IBadgeProps["variant"]> = {
    create: "accent",
    update: "outline",
    delete: "destructive"
}

const isActive = (status?: AiChangeStatus) => Boolean(status && AI_CHANGE_ACTIVE_STATUSES.includes(status))

const firstLine = (text: string) =>
    text
        .split("\n")
        .find(line => line.trim().length > 0)
        ?.trim() ?? ""

const conflictsOf = (error: Error): string[] => (error as AxiosError<{ error?: { details?: { conflicts?: string[] } } }>)?.response?.data?.error?.details?.conflicts ?? []

/** Set on the requests of a job over several repositories: the request is one part of a wider change. */
const JobBadge: React.FC<{ request: AiChangeRequest }> = ({ request }) => {
    const { t } = useTranslation()
    if (!request.jobId || !request.jobRepositoryCount || request.jobRepositoryCount <= 1) return null
    return <Badge variant="outline">{t("microfrontend.aiChange.job_badge", { count: request.jobRepositoryCount })}</Badge>
}

const WarningAlert: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Alert className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="whitespace-pre-wrap break-words">{children}</AlertDescription>
    </Alert>
)

interface ProposalProps {
    request: AiChangeRequest
    onApplied: (request: AiChangeRequest) => void
    onConflict: () => void
    onDiscarded: (request: AiChangeRequest) => void
}

const Proposal: React.FC<ProposalProps> = ({ request, onApplied, onConflict, onDiscarded }) => {
    const { t } = useTranslation()
    const aiChangesApi = useAiChangesApi()
    const notifications = useToastNotificationStore()
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set(request.files.slice(0, 1).map(file => file.path)))
    const idPrefix = useId()

    const applyMutation = useMutation({
        mutationFn: () =>
            aiChangesApi.apply(request._id, {
                customErrorMessage: error => {
                    const code = errorCodeOf(error)
                    if (code === "AI_CHANGE_CONFLICT") return t("microfrontend.aiChange.errors.AI_CHANGE_CONFLICT", { files: conflictsOf(error).join(", ") })
                    if (code === "AI_CHANGE_NOT_PROPOSED") return t("microfrontend.aiChange.errors.AI_CHANGE_NOT_PROPOSED")
                    return t("microfrontend.aiChange.errors.apply")
                }
            }),
        onSuccess: applied => {
            notifications.showSuccessNotification({ message: t("microfrontend.aiChange.applied_success") })
            onApplied(applied)
        },
        onError: () => onConflict()
    })

    const discardMutation = useMutation({
        mutationFn: () => aiChangesApi.discard(request._id),
        onSuccess: discarded => {
            notifications.showInfoNotification({ message: t("microfrontend.aiChange.discarded_success") })
            onDiscarded(discarded)
        }
    })

    const busy = applyMutation.isPending || discardMutation.isPending

    const toggle = (set: Set<string>, path: string) => {
        const next = new Set(set)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
    }

    if (request.files.length === 0) {
        return (
            <div className="flex flex-col gap-3">
                <Alert>
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    <AlertTitle>{t("microfrontend.aiChange.no_changes_title")}</AlertTitle>
                    <AlertDescription>{t("microfrontend.aiChange.no_changes_description")}</AlertDescription>
                </Alert>
                <div className="flex justify-end">
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => discardMutation.mutate()}>
                        <Trash2 aria-hidden="true" />
                        {t("microfrontend.aiChange.discard")}
                    </Button>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{t("microfrontend.aiChange.files_title")}</h4>
                <span className="text-xs text-muted-foreground">{t("microfrontend.aiChange.files_count", { count: request.files.length })}</span>
            </div>
            <ul className="flex flex-col gap-2">
                {request.files.map(file => {
                    const diffId = `${idPrefix}-diff-${file.path}`
                    const isExpanded = expanded.has(file.path)
                    return (
                        <li key={file.path} className="overflow-hidden rounded-md border border-divider">
                            <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
                                <span className="min-w-0 flex-1 break-all font-mono text-xs">{file.path}</span>
                                <Badge variant={ACTION_VARIANT[file.action]}>{t(`microfrontend.aiChange.action.${file.action}`)}</Badge>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-expanded={isExpanded}
                                    aria-controls={diffId}
                                    aria-label={t(isExpanded ? "microfrontend.aiChange.hide_diff" : "microfrontend.aiChange.show_diff", { path: file.path })}
                                    onClick={() => setExpanded(current => toggle(current, file.path))}
                                >
                                    {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                                </Button>
                            </div>
                            {isExpanded && (
                                <div id={diffId} className="border-t border-divider">
                                    <AiChangeDiff file={file} />
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>
            <p className="text-sm text-foreground-secondary">{t("microfrontend.aiChange.apply_runs_ci")}</p>
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => discardMutation.mutate()}>
                    <Trash2 aria-hidden="true" />
                    {t("microfrontend.aiChange.discard")}
                </Button>
                <Button type="button" disabled={busy} onClick={() => applyMutation.mutate()}>
                    {applyMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <GitBranch aria-hidden="true" />}
                    {t("microfrontend.aiChange.apply")}
                </Button>
            </div>
        </div>
    )
}

interface RequestViewProps {
    request: AiChangeRequest
    onRetry: (request: AiChangeRequest) => void
    onUpdated: (request: AiChangeRequest) => void
    onConflict: () => void
}

const RequestView: React.FC<RequestViewProps> = ({ request, onRetry, onUpdated, onConflict }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    const active = isActive(request.status)
    const finished = !active

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="mb-0 break-words">{firstLine(request.prompt)}</CardTitle>
                        <CardDescription>
                            {t("microfrontend.aiChange.request_meta", {
                                date: format(new Date(request.createdAt), "PPp", { locale: themeStore.getLocale() }),
                                branch: request.baseBranch
                            })}
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <JobBadge request={request} />
                        <StatusBadge status={request.status} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-3">
                <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">{t("microfrontend.aiChange.show_prompt")}</summary>
                    <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3">{request.prompt}</p>
                </details>

                {active && (
                    <output className="flex items-center gap-2 text-sm">
                        <Spinner size={16} centerScreen={false} />
                        <span>{t(`microfrontend.aiChange.status_description.${request.status}`)}</span>
                    </output>
                )}

                {request.error && request.status === "PROPOSED" && <WarningAlert title={t("microfrontend.aiChange.proposal_warning")}>{request.error}</WarningAlert>}

                {request.status === "FAILED" && (
                    <Alert variant="destructive">
                        <AlertTriangle className="size-4" aria-hidden="true" />
                        <AlertTitle>{t("microfrontend.aiChange.failed_title")}</AlertTitle>
                        <AlertDescription className="whitespace-pre-wrap break-words">{request.error || t("microfrontend.aiChange.errors.generic")}</AlertDescription>
                    </Alert>
                )}

                {request.status === "APPLIED" && (
                    <Alert>
                        <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                        <AlertTitle>{t("microfrontend.aiChange.applied_title")}</AlertTitle>
                        <AlertDescription className="flex flex-col gap-1">
                            {request.branch && (
                                <span>
                                    {t("microfrontend.aiChange.branch")}: <code className="font-mono text-xs">{request.branch}</code>
                                </span>
                            )}
                            {request.pullRequestUrl && (
                                <a
                                    href={request.pullRequestUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                                >
                                    {t("microfrontend.aiChange.open_pull_request")}
                                    <ExternalLink className="size-3.5" aria-hidden="true" />
                                    <span className="sr-only">{t("microfrontend.aiChange.opens_new_tab")}</span>
                                </a>
                            )}
                        </AlertDescription>
                    </Alert>
                )}

                {request.status === "APPLIED" && request.pullRequestError && <WarningAlert title={t("microfrontend.aiChange.pull_request_error_title")}>{request.pullRequestError}</WarningAlert>}

                {request.status === "DISCARDED" && <p className="text-sm text-muted-foreground">{t("microfrontend.aiChange.discarded_description")}</p>}

                {request.summary && finished && (
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-semibold">{t("microfrontend.aiChange.summary")}</h4>
                        <p className="whitespace-pre-wrap break-words text-sm">{request.summary}</p>
                    </div>
                )}

                {request.status === "PROPOSED" && <Proposal key={request.updatedAt} request={request} onApplied={onUpdated} onDiscarded={onUpdated} onConflict={onConflict} />}

                {(request.status === "FAILED" || request.status === "DISCARDED") && (
                    <div className="flex justify-end">
                        <Button type="button" variant="secondary" onClick={() => onRetry(request)}>
                            <RotateCcw aria-hidden="true" />
                            {t("microfrontend.aiChange.try_again")}
                        </Button>
                    </div>
                )}

                {active ? (
                    <ProgressLog events={request.events ?? []} live />
                ) : (
                    request.events &&
                    request.events.length > 0 && (
                        <details className="text-sm">
                            <summary className="cursor-pointer text-muted-foreground">{t("microfrontend.aiChange.show_progress_log")}</summary>
                            <div className="mt-2">
                                <ProgressLog events={request.events} live={false} />
                            </div>
                        </details>
                    )
                )}

                {/* Live while the agent works: the cost of the job grows with every round. */}
                {(finished || request.usage.inputTokens > 0) && (
                    <div className="flex flex-col gap-0.5">
                        <AnswerUsage
                            usage={{ ...request.usage, cachedInputTokens: request.usage.cachedInputTokens ?? 0 }}
                            label={t("microfrontend.aiChange.usage_label")}
                            hint={t("microfrontend.aiChange.usage_hint")}
                        />
                        {request.jobRepositoryCount !== undefined && request.jobRepositoryCount > 1 && (
                            <p className="text-xs text-muted-foreground">{t("microfrontend.aiChange.usage_shared", { count: request.jobRepositoryCount })}</p>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

/** The value of `?change=` that opens the composer instead of a request. */
const NEW_CHANGE = "new"

/** The queue groups requests by what they wait for: the user's review, the agent, or nothing at all. */
type QueueGroup = "review" | "active" | "discarded" | "history"

const groupOf = (status: AiChangeStatus): QueueGroup => {
    if (status === "PROPOSED") return "review"
    if (isActive(status)) return "active"
    if (status === "DISCARDED") return "discarded"
    return "history"
}

const GROUP_ICON: Record<QueueGroup, React.FC<{ className?: string }>> = {
    review: ClipboardCheck,
    active: LoaderCircle,
    discarded: Trash2,
    history: Archive
}

/** What opens when no request is linked: a proposal to review first, then work in progress, otherwise a new request. */
const defaultSelection = (requests: AiChangeRequest[]) => requests.find(request => request.status === "PROPOSED")?._id ?? requests.find(request => isActive(request.status))?._id ?? NEW_CHANGE

const QueueItem: React.FC<{ request: AiChangeRequest; selected: boolean; onSelect: () => void }> = ({ request, selected, onSelect }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    return (
        <li>
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                // The label replaces the content of the button: it has to carry the status the badges show.
                aria-label={`${t("microfrontend.aiChange.open_request", { prompt: firstLine(request.prompt) })} · ${t(`microfrontend.aiChange.status.${request.status}`)}`}
                onClick={onSelect}
                className={cn(
                    "flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-primary/5" : "border-divider hover:border-primary/50 hover:bg-muted/40"
                )}
            >
                <span className="line-clamp-2 break-words text-sm font-medium">{firstLine(request.prompt)}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <time dateTime={request.createdAt}>{format(new Date(request.createdAt), "PPp", { locale: themeStore.getLocale() })}</time>
                    {request.files.length > 0 && <span>· {t("microfrontend.aiChange.files_count", { count: request.files.length })}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={request.status} />
                    <JobBadge request={request} />
                </span>
            </button>
        </li>
    )
}

interface QueueSectionProps {
    group: QueueGroup
    requests: AiChangeRequest[]
    selectedId: string
    onSelect: (id: string) => void
}

const QueueSection: React.FC<QueueSectionProps> = ({ group, requests, selectedId, onSelect }) => {
    const { t } = useTranslation()
    const headingId = useId()
    const Icon = GROUP_ICON[group]
    const containsSelected = requests.some(request => request._id === selectedId)
    const [historyOpen, setHistoryOpen] = useState(containsSelected)

    // A request of the group opened from elsewhere (a deep link): unfold it. Never fold it back on the user.
    useEffect(() => {
        if (containsSelected) setHistoryOpen(true)
    }, [containsSelected])
    const heading = (
        <span className="flex items-center justify-between gap-2">
            <span id={headingId} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                <Icon className={cn("size-3.5", group === "active" && requests.length > 0 && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                {t(`microfrontend.aiChange.groups.${group}`)}
            </span>
            <Badge variant={group === "review" && requests.length > 0 ? "accent" : "outline"}>{requests.length}</Badge>
        </span>
    )
    const list =
        requests.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t(`microfrontend.aiChange.group_empty.${group}`)}</p>
        ) : (
            <ul aria-labelledby={headingId} className="flex flex-col gap-1.5">
                {requests.map(request => (
                    <QueueItem key={request._id} request={request} selected={request._id === selectedId} onSelect={() => onSelect(request._id)} />
                ))}
            </ul>
        )

    // Applied and failed requests are done with: keep them out of the way unless one of them is open.
    if (group === "history") {
        return (
            <details open={historyOpen} onToggle={event => setHistoryOpen(event.currentTarget.open)}>
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{heading}</summary>
                <div className="mt-2">{list}</div>
            </details>
        )
    }

    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-2">
            {heading}
            {list}
        </section>
    )
}

interface ComposerProps {
    microfrontendName: string
    prompt: string
    baseBranch: string
    onPromptChange: (value: string) => void
    onBaseBranchChange: (value: string) => void
    onSubmit: () => void
    pending: boolean
    error?: string
    promptRef: React.RefObject<HTMLTextAreaElement | null>
    /** Set when "New change" or "Try again" asked for the composer before it was on screen. */
    focusOnMount: React.RefObject<boolean>
}

const Composer: React.FC<ComposerProps> = ({ microfrontendName, prompt, baseBranch, onPromptChange, onBaseBranchChange, onSubmit, pending, error, promptRef, focusOnMount }) => {
    const { t } = useTranslation()
    const promptId = useId()
    const branchId = useId()
    // Read once: tied to the live value, the section would fold while the user clears the branch.
    const [advancedOpen] = useState(() => Boolean(baseBranch))

    // biome-ignore lint/correctness/useExhaustiveDependencies: only the mount decides
    useEffect(() => {
        if (!focusOnMount.current) return
        focusOnMount.current = false
        promptRef.current?.focus()
    }, [])

    return (
        <form
            noValidate
            onSubmit={event => {
                event.preventDefault()
                onSubmit()
            }}
        >
            <Card className="border-primary/40 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
                <CardHeader>
                    <CardTitle className="mb-0 flex items-center gap-2 break-words text-xl">
                        <Sparkles className="size-5 shrink-0 text-primary" aria-hidden="true" />
                        {t("microfrontend.aiChange.composer_title", { name: microfrontendName })}
                    </CardTitle>
                    <CardDescription>{t("microfrontend.aiChange.description")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pt-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={promptId} className="sr-only">
                            {t("microfrontend.aiChange.prompt_label")}
                        </Label>
                        <Textarea
                            id={promptId}
                            ref={promptRef}
                            value={prompt}
                            rows={8}
                            maxLength={PROMPT_MAX_LENGTH}
                            required
                            aria-invalid={Boolean(error)}
                            aria-describedby={`${promptId}-hint`}
                            placeholder={t("microfrontend.aiChange.prompt_placeholder")}
                            disabled={pending}
                            onChange={event => onPromptChange(event.target.value)}
                            onKeyDown={event => {
                                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault()
                                    onSubmit()
                                }
                            }}
                            dataTestId="ai-change-prompt"
                        />
                        <div id={`${promptId}-hint`} className="flex justify-between gap-2 text-xs">
                            <span className="text-destructive">{error}</span>
                            <span className="text-muted-foreground">{t("microfrontend.aiChange.prompt_counter", { count: prompt.length, max: PROMPT_MAX_LENGTH })}</span>
                        </div>
                    </div>
                    {/* Open when a retry brought a branch back, so the user sees where the agent will start from. */}
                    <details className="text-sm" open={advancedOpen || undefined}>
                        <summary className="cursor-pointer text-muted-foreground">{t("microfrontend.aiChange.advanced_options")}</summary>
                        <div className="mt-3 flex flex-col gap-1.5">
                            <Label htmlFor={branchId}>{t("microfrontend.aiChange.base_branch_label")}</Label>
                            <Input
                                id={branchId}
                                value={baseBranch}
                                placeholder={t("microfrontend.aiChange.base_branch_placeholder")}
                                disabled={pending}
                                onChange={event => onBaseBranchChange(event.target.value)}
                                fullWidth
                                dataTestId="ai-change-base-branch"
                            />
                        </div>
                    </details>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{t("microfrontend.aiChange.composer_shortcut")}</span>
                        <Button type="submit" disabled={pending} dataTestId="ai-change-generate">
                            {pending ? <Spinner size={16} centerScreen={false} /> : <Sparkles aria-hidden="true" />}
                            {t("microfrontend.aiChange.generate")}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </form>
    )
}

interface AiChangeWorkspaceProps {
    microfrontendId: string
    microfrontendName: string
}

/**
 * The "Edit with AI" workspace, the landing screen of a microfrontend: the queue of its requests on one side
 * (waiting for review, in progress, discarded, done) and the selected one, or a new request, on the other.
 * The selection lives in `?change=`, so the assistant can link a job straight to its diff.
 */
export const AiChangeWorkspace: React.FC<AiChangeWorkspaceProps> = ({ microfrontendId, microfrontendName }) => {
    const { t } = useTranslation()
    const aiChangesApi = useAiChangesApi()
    const queryClient = useQueryClient()
    const [prompt, setPrompt] = useState("")
    const [baseBranch, setBaseBranch] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const [searchParams, setSearchParams] = useSearchParams()
    const promptRef = useRef<HTMLTextAreaElement>(null)
    const focusComposer = useRef(false)
    const linkedId = searchParams.get("change") ?? undefined

    const historyQueryKey = ["ai-changes", microfrontendId]

    const historyQuery = useQuery({
        queryKey: historyQueryKey,
        queryFn: () => aiChangesApi.getByMicrofrontendId(microfrontendId),
        // Jobs started from the assistant land here too: keep the queue moving while any agent works.
        refetchInterval: query => (query.state.data?.some(request => isActive(request.status)) ? POLL_INTERVAL_MS * 2 : false)
    })

    const select = (id: string) =>
        setSearchParams(
            current => {
                const next = new URLSearchParams(current)
                next.delete("tab")
                next.set("change", id)
                return next
            },
            { replace: true }
        )

    // Nothing linked: open what needs attention first. Pinned in the URL, so the selection does not jump when the queue moves.
    // biome-ignore lint/correctness/useExhaustiveDependencies: only the arrival of the queue decides the default
    useEffect(() => {
        if (!linkedId && historyQuery.data) select(defaultSelection(historyQuery.data))
    }, [linkedId, historyQuery.data])

    const selectedId = linkedId && linkedId !== NEW_CHANGE ? linkedId : undefined

    const requestQuery = useQuery({
        queryKey: ["ai-change", selectedId],
        queryFn: () => aiChangesApi.getSingle(selectedId!),
        enabled: Boolean(selectedId),
        refetchInterval: query => (isActive(query.state.data?.status) ? POLL_INTERVAL_MS : false)
    })

    // The queue only shows statuses: refresh it when the polled request settles, not on every finished request opened.
    const status = requestQuery.data?.status
    const wasActive = useRef(false)
    useEffect(() => {
        if (isActive(status)) wasActive.current = true
        else if (status && wasActive.current) {
            wasActive.current = false
            queryClient.invalidateQueries({ queryKey: ["ai-changes", microfrontendId] })
        }
    }, [status, microfrontendId, queryClient])

    const createMutation = useMutation({
        mutationFn: () =>
            aiChangesApi.create(
                microfrontendId,
                { prompt: prompt.trim(), baseBranch: baseBranch.trim() || undefined },
                {
                    customErrorMessage: error => {
                        const code = errorCodeOf(error)
                        return code && CREATE_ERROR_CODES.has(code) ? t(`microfrontend.aiChange.errors.${code}`) : t("microfrontend.aiChange.errors.create")
                    }
                }
            ),
        onSuccess: created => {
            queryClient.setQueryData(["ai-change", created._id], created)
            setPrompt("")
            setBaseBranch("")
            setSubmitted(false)
            queryClient.invalidateQueries({ queryKey: historyQueryKey })
        }
    })

    const promptError = submitted && prompt.trim().length === 0 ? t("microfrontend.aiChange.prompt_required") : undefined

    const generate = () => {
        setSubmitted(true)
        if (prompt.trim().length === 0 || prompt.length > PROMPT_MAX_LENGTH) {
            promptRef.current?.focus()
            return
        }
        // Navigation goes in the call options: they are skipped once the page is left, the hook-level callback is not.
        createMutation.mutate(undefined, { onSuccess: created => select(created._id) })
    }

    const startNew = () => {
        select(NEW_CHANGE)
        if (promptRef.current) promptRef.current.focus()
        else focusComposer.current = true
    }

    const retry = (request: AiChangeRequest) => {
        setPrompt(request.prompt)
        setBaseBranch(request.baseBranch)
        startNew()
    }

    const onUpdated = (request: AiChangeRequest) => {
        queryClient.setQueryData(["ai-change", request._id], request)
        queryClient.invalidateQueries({ queryKey: historyQueryKey })
    }

    const onConflict = () => {
        requestQuery.refetch()
        queryClient.invalidateQueries({ queryKey: historyQueryKey })
    }

    const requests = historyQuery.data ?? []
    const groups: QueueGroup[] = ["review", "active", "discarded", "history"]

    return (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <aside aria-label={t("microfrontend.aiChange.queue_label")} className="flex flex-col gap-5 lg:sticky lg:top-4">
                <Button type="button" variant={linkedId === NEW_CHANGE ? "secondary" : "primary"} onClick={startNew} dataTestId="ai-change-new">
                    <Plus aria-hidden="true" />
                    {t("microfrontend.aiChange.new_change")}
                </Button>
                {historyQuery.isPending && <Spinner size={24} centerScreen={false} label={t("common.loading")} />}
                {historyQuery.isError && <p className="text-sm text-destructive">{t("microfrontend.aiChange.errors.history")}</p>}
                {historyQuery.data &&
                    groups.map(group => (
                        <QueueSection key={group} group={group} requests={requests.filter(request => groupOf(request.status) === group)} selectedId={linkedId ?? ""} onSelect={select} />
                    ))}
            </aside>

            <div className="min-w-0">
                {(linkedId === NEW_CHANGE || (!linkedId && historyQuery.data?.length === 0)) && (
                    <Composer
                        microfrontendName={microfrontendName}
                        prompt={prompt}
                        baseBranch={baseBranch}
                        onPromptChange={setPrompt}
                        onBaseBranchChange={setBaseBranch}
                        onSubmit={generate}
                        pending={createMutation.isPending}
                        error={promptError}
                        promptRef={promptRef}
                        focusOnMount={focusComposer}
                    />
                )}
                {selectedId && requestQuery.isPending && (
                    <div className="flex justify-center py-6">
                        <Spinner size={24} centerScreen={false} label={t("common.loading")} />
                    </div>
                )}
                {selectedId && requestQuery.isError && (
                    <Alert variant="destructive">
                        <AlertDescription>{t("microfrontend.aiChange.errors.load")}</AlertDescription>
                    </Alert>
                )}
                {selectedId && requestQuery.data && <RequestView request={requestQuery.data} onRetry={retry} onUpdated={onUpdated} onConflict={onConflict} />}
            </div>
        </div>
    )
}

export default AiChangeWorkspace
