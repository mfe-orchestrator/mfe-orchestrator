import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Spinner, Textarea } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AxiosError } from "axios"
import { format } from "date-fns"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ExternalLink, GitBranch, RotateCcw, Sparkles, Trash2 } from "lucide-react"
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

interface AiChangeSectionProps {
    microfrontendId: string
}

/**
 * The "Edit with AI" tab. It lives inside the microfrontend edit form, so nothing here may submit it:
 * the inputs are plain controlled components (not registered in the outer form) and every button is `type="button"`.
 */
export const AiChangeSection: React.FC<AiChangeSectionProps> = ({ microfrontendId }) => {
    const { t } = useTranslation()
    const aiChangesApi = useAiChangesApi()
    const queryClient = useQueryClient()
    const themeStore = useThemeStore()
    const [prompt, setPrompt] = useState("")
    const [baseBranch, setBaseBranch] = useState("")
    const [searchParams] = useSearchParams()
    // A deep link (`?change=<id>`, from a job of the assistant) opens that request instead of the latest one.
    const linkedId = searchParams.get("change") ?? undefined
    const [selectedId, setSelectedId] = useState<string | undefined>(linkedId)
    const [submitted, setSubmitted] = useState(false)
    const promptRef = useRef<HTMLTextAreaElement>(null)
    const autoSelected = useRef(Boolean(linkedId))
    const promptId = useId()
    const branchId = useId()

    const historyQueryKey = ["ai-changes", microfrontendId]

    const historyQuery = useQuery({
        queryKey: historyQueryKey,
        queryFn: () => aiChangesApi.getByMicrofrontendId(microfrontendId)
    })

    const requestQuery = useQuery({
        queryKey: ["ai-change", selectedId],
        queryFn: () => aiChangesApi.getSingle(selectedId!),
        enabled: Boolean(selectedId),
        refetchInterval: query => (isActive(query.state.data?.status) ? POLL_INTERVAL_MS : false)
    })

    // Another link followed while the page is open.
    useEffect(() => {
        if (!linkedId) return
        autoSelected.current = true
        setSelectedId(linkedId)
    }, [linkedId])

    // Back on the tab with work in progress (or a proposal waiting for review): show it straight away.
    useEffect(() => {
        if (autoSelected.current || !historyQuery.data) return
        autoSelected.current = true
        const latest = historyQuery.data[0]
        if (latest && (isActive(latest.status) || latest.status === "PROPOSED")) setSelectedId(latest._id)
    }, [historyQuery.data])

    // The history only shows statuses: refresh it when the polled request settles.
    const status = requestQuery.data?.status
    useEffect(() => {
        if (status && !isActive(status)) queryClient.invalidateQueries({ queryKey: ["ai-changes", microfrontendId] })
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
            setSelectedId(created._id)
            setPrompt("")
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
        createMutation.mutate()
    }

    const retry = (request: AiChangeRequest) => {
        setPrompt(request.prompt)
        setBaseBranch(request.baseBranch)
        promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
        promptRef.current?.focus()
    }

    const onUpdated = (request: AiChangeRequest) => {
        queryClient.setQueryData(["ai-change", request._id], request)
        queryClient.invalidateQueries({ queryKey: historyQueryKey })
    }

    const onConflict = () => {
        requestQuery.refetch()
        queryClient.invalidateQueries({ queryKey: historyQueryKey })
    }

    // Enter in a single-line input would submit the surrounding microfrontend form.
    const preventFormSubmit = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") {
            event.preventDefault()
            generate()
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="mb-0">{t("microfrontend.aiChange.title")}</CardTitle>
                    <CardDescription>{t("microfrontend.aiChange.description")}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 pt-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={promptId}>
                            {t("microfrontend.aiChange.prompt_label")}
                            <span aria-hidden="true"> *</span>
                        </Label>
                        <Textarea
                            id={promptId}
                            ref={promptRef}
                            value={prompt}
                            rows={6}
                            maxLength={PROMPT_MAX_LENGTH}
                            // No native `required`: the browser would then block the Save of the surrounding form.
                            aria-required="true"
                            aria-invalid={Boolean(promptError)}
                            aria-describedby={`${promptId}-hint`}
                            placeholder={t("microfrontend.aiChange.prompt_placeholder")}
                            disabled={createMutation.isPending}
                            onChange={event => setPrompt(event.target.value)}
                            dataTestId="ai-change-prompt"
                        />
                        <div id={`${promptId}-hint`} className="flex justify-between gap-2 text-xs">
                            <span className="text-destructive">{promptError}</span>
                            <span className="text-muted-foreground">{t("microfrontend.aiChange.prompt_counter", { count: prompt.length, max: PROMPT_MAX_LENGTH })}</span>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={branchId}>{t("microfrontend.aiChange.base_branch_label")}</Label>
                        <Input
                            id={branchId}
                            value={baseBranch}
                            placeholder={t("microfrontend.aiChange.base_branch_placeholder")}
                            disabled={createMutation.isPending}
                            onChange={event => setBaseBranch(event.target.value)}
                            onKeyDown={preventFormSubmit}
                            fullWidth
                            dataTestId="ai-change-base-branch"
                        />
                    </div>
                    <div className="flex justify-end">
                        <Button type="button" disabled={createMutation.isPending} onClick={generate} dataTestId="ai-change-generate">
                            {createMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <Sparkles aria-hidden="true" />}
                            {t("microfrontend.aiChange.generate")}
                        </Button>
                    </div>
                </CardContent>
            </Card>

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

            <Card>
                <CardHeader>
                    <CardTitle className="mb-0">{t("microfrontend.aiChange.history_title")}</CardTitle>
                    <CardDescription>{t("microfrontend.aiChange.history_description")}</CardDescription>
                </CardHeader>
                <CardContent className="pt-3">
                    {historyQuery.isPending && <Spinner size={24} centerScreen={false} label={t("common.loading")} />}
                    {historyQuery.isError && <p className="text-sm text-destructive">{t("microfrontend.aiChange.errors.history")}</p>}
                    {historyQuery.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("microfrontend.aiChange.history_empty")}</p>}
                    {Boolean(historyQuery.data?.length) && (
                        <ul className="flex flex-col divide-y divide-divider">
                            {historyQuery.data?.map(item => (
                                <li key={item._id} className={`flex items-center gap-3 py-2 ${item._id === selectedId ? "bg-muted/40" : ""}`}>
                                    <button
                                        type="button"
                                        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-sm px-2 text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        aria-current={item._id === selectedId ? "true" : undefined}
                                        aria-label={t("microfrontend.aiChange.open_request", { prompt: firstLine(item.prompt) })}
                                        onClick={() => setSelectedId(item._id)}
                                    >
                                        <span className="w-full truncate text-sm font-medium">{firstLine(item.prompt)}</span>
                                        <span className="text-xs text-muted-foreground">{format(new Date(item.createdAt), "PPp", { locale: themeStore.getLocale() })}</span>
                                    </button>
                                    {item.pullRequestUrl && (
                                        <a
                                            href={item.pullRequestUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                                        >
                                            {t("microfrontend.aiChange.pull_request")}
                                            <ExternalLink className="size-3" aria-hidden="true" />
                                            <span className="sr-only">{t("microfrontend.aiChange.opens_new_tab")}</span>
                                        </a>
                                    )}
                                    <JobBadge request={item} />
                                    <StatusBadge status={item.status} />
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}

export default AiChangeSection
