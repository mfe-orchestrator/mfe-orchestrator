import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Spinner, Textarea } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AxiosError } from "axios"
import { format } from "date-fns"
import { AlertTriangle, Archive, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, ExternalLink, GitBranch, LoaderCircle, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import AnswerUsage from "@/components/assistant/AnswerUsage"
import { jobErrorMessage, sumUsage } from "@/components/assistant/AssistantJobThread"
import type { IBadgeProps } from "@/components/atoms"
import { Badge, Button } from "@/components/atoms"
import useAiChangesApi, { AI_CHANGE_ACTIVE_STATUSES, AiChangeFile, AiChangeRequest, AiChangeStatus, AiChangeTarget } from "@/hooks/apiClients/useAiChangesApi"
import useAiJobsApi, { AiJob, AiJobRepository, isAiJobActive } from "@/hooks/apiClients/useAiJobsApi"
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

const AppliedAlert: React.FC<{ branch?: string; pullRequestUrl?: string }> = ({ branch, pullRequestUrl }) => {
    const { t } = useTranslation()
    return (
        <Alert>
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-hidden="true" />
            <AlertTitle>{t("microfrontend.aiChange.applied_title")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
                {branch && (
                    <span>
                        {t("microfrontend.aiChange.branch")}: <code className="font-mono text-xs">{branch}</code>
                    </span>
                )}
                {pullRequestUrl && (
                    <a href={pullRequestUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                        {t("microfrontend.aiChange.open_pull_request")}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">{t("microfrontend.aiChange.opens_new_tab")}</span>
                    </a>
                )}
            </AlertDescription>
        </Alert>
    )
}

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

/** A request made before requests became conversations: it has no job to follow up on. */
interface RequestViewProps {
    request: AiChangeRequest
    onRetry: (prompt: string, baseBranch: string) => void
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
                        {/* A prompt is often one long line: clamp it, the whole text is one click away under "Show the full request". */}
                        <CardTitle className="mb-0 line-clamp-3 break-words text-base leading-snug" title={firstLine(request.prompt)}>
                            {firstLine(request.prompt)}
                        </CardTitle>
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

                {request.status === "APPLIED" && <AppliedAlert branch={request.branch} pullRequestUrl={request.pullRequestUrl} />}

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
                        <Button type="button" variant="secondary" onClick={() => onRetry(request.prompt, request.baseBranch)}>
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

/** One message of a conversation: what the user asked, and what the agent did with it on this repository. */
interface Turn {
    job: AiJob
    repository: AiJobRepository
}

/** Still moving: the agent works, or the proposal is being pushed. */
const isTurnActive = (turn: Turn) => isAiJobActive(turn.job.status) || isActive(turn.repository.status)

interface TurnViewProps {
    turn: Turn
    /** Refined by a later message: its files went on into the next proposal. */
    superseded: boolean
    /** The diff and its actions, on the message whose proposal is open for review. */
    proposal?: React.ReactNode
}

const TurnView: React.FC<TurnViewProps> = ({ turn, superseded, proposal }) => {
    const { t } = useTranslation()
    const { job, repository } = turn
    const active = isTurnActive(turn)

    return (
        <div className="flex flex-col gap-3">
            <p className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-lg bg-primary/10 px-3 py-2 text-sm">{job.prompt}</p>

            {active && isActive(repository.status) && (
                <output className="flex items-center gap-2 text-sm">
                    <Spinner size={16} centerScreen={false} />
                    <span>{t(`microfrontend.aiChange.status_description.${repository.status}`)}</span>
                </output>
            )}

            {repository.status === "FAILED" && (
                <Alert variant="destructive">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    <AlertTitle>{t("microfrontend.aiChange.failed_title")}</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap break-words">{repository.error || job.error || t("microfrontend.aiChange.errors.generic")}</AlertDescription>
                </Alert>
            )}

            {job.summary && !active && <p className="whitespace-pre-wrap break-words text-sm">{job.summary}</p>}

            {repository.status === "PROPOSED" && repository.error && <WarningAlert title={t("microfrontend.aiChange.proposal_warning")}>{repository.error}</WarningAlert>}

            {proposal}

            {repository.status === "APPLIED" && <AppliedAlert branch={repository.branch} pullRequestUrl={repository.pullRequestUrl} />}
            {repository.status === "APPLIED" && repository.pullRequestError && <WarningAlert title={t("microfrontend.aiChange.pull_request_error_title")}>{repository.pullRequestError}</WarningAlert>}

            {repository.status === "DISCARDED" && (
                <p className="text-sm text-muted-foreground">{t(superseded ? "microfrontend.aiChange.superseded" : "microfrontend.aiChange.discarded_description")}</p>
            )}

            {active ? (
                <ProgressLog events={job.events ?? []} live />
            ) : (
                Boolean(job.events?.length) && (
                    <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">{t("microfrontend.aiChange.show_progress_log")}</summary>
                        <div className="mt-2">
                            <ProgressLog events={job.events ?? []} live={false} />
                        </div>
                    </details>
                )
            )}

            {/* Live while the agent works: the cost of the job grows with every round. */}
            {(!active || job.usage.inputTokens > 0) && (
                <div className="flex flex-col gap-0.5">
                    <AnswerUsage usage={job.usage} label={t("microfrontend.aiChange.usage_label")} hint={t("microfrontend.aiChange.usage_hint")} />
                    {job.repositories.length > 1 && <p className="text-xs text-muted-foreground">{t("microfrontend.aiChange.usage_shared", { count: job.repositories.length })}</p>}
                </div>
            )}
        </div>
    )
}

interface FollowUpFormProps {
    target: AiChangeTarget
    /** The message whose proposal a follow-up refines: none while the agent works or once nothing is left to refine. */
    open?: Turn
    placeholder: string
    onSent: (child: AiJob) => void
    /** Refused: the conversation most likely moved on elsewhere (the assistant, another tab). */
    onFailed: () => void
}

/** Goes on with the conversation: a follow-up starts from the open proposal and replaces it once it proposes. */
const FollowUpForm: React.FC<FollowUpFormProps> = ({ target, open, placeholder, onSent, onFailed }) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const [draft, setDraft] = useState("")
    const promptId = useId()
    const locked = !open

    const followUpMutation = useMutation({
        mutationFn: ({ jobId, prompt }: { jobId: string; prompt: string }) =>
            aiJobsApi.followUp(
                jobId,
                // This repository only: the others of a job over several go on from their own page, or from the assistant.
                { prompt, ...(target.kind === "service" ? { serviceIds: [target.id] } : { microfrontendIds: [target.id] }) },
                { customErrorMessage: error => jobErrorMessage(t, error, "follow_up") }
            ),
        onSuccess: child => {
            setDraft("")
            onSent(child)
        },
        onError: onFailed
    })

    const submit = () => {
        if (!draft.trim() || locked || followUpMutation.isPending) return
        followUpMutation.mutate({ jobId: open.job._id, prompt: draft.trim() })
    }

    return (
        <form
            className="flex items-end gap-2 border-t border-divider pt-4"
            onSubmit={event => {
                event.preventDefault()
                submit()
            }}
        >
            <Label htmlFor={promptId} className="sr-only">
                {t("microfrontend.aiChange.follow_up_label")}
            </Label>
            <Textarea
                id={promptId}
                value={draft}
                maxLength={PROMPT_MAX_LENGTH}
                rows={2}
                className={cn("min-h-[44px] resize-none", locked && "cursor-not-allowed opacity-60")}
                // Read-only rather than disabled: the field keeps the focus while the agent works on what was just sent.
                readOnly={locked || followUpMutation.isPending}
                aria-disabled={locked || undefined}
                aria-describedby={`${promptId}-state`}
                placeholder={placeholder}
                dataTestId="ai-change-follow-up"
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        submit()
                    }
                }}
            />
            {/* A placeholder is not read out: the state of the conversation is, as the field's description. */}
            <span id={`${promptId}-state`} className="sr-only" aria-live="polite">
                {placeholder}
            </span>
            <Button
                type="submit"
                size="icon"
                aria-label={t("microfrontend.aiChange.follow_up_send")}
                disabled={!draft.trim() || locked || followUpMutation.isPending}
                dataTestId="ai-change-follow-up-send"
            >
                {followUpMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <ArrowUp aria-hidden="true" />}
            </Button>
        </form>
    )
}

interface ChangeThreadProps {
    /** The request opened: any of the conversation, which is the chain of follow-ups of its job. */
    request: AiChangeRequest
    target: AiChangeTarget
    onRetry: (prompt: string, baseBranch: string) => void
    /** Something the queue shows has changed: a new message, a proposal ready, applied or discarded. */
    onQueueChanged: () => void
    /** The request on its own, shown when its conversation cannot be loaded (its jobs expired). */
    fallback: React.ReactNode
}

/**
 * The conversation a request belongs to: every message asked on this repository with what the agent did, the
 * latest proposal to review, and the input to refine it further before applying it.
 */
const ChangeThread: React.FC<ChangeThreadProps> = ({ request, target, onRetry, onQueueChanged, fallback }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    const aiJobsApi = useAiJobsApi()
    const aiChangesApi = useAiChangesApi()
    const queryClient = useQueryClient()
    // By conversation: any of its requests opens the same thread, from the same cache.
    const chainQueryKey = ["ai-change-thread", request.conversationId]

    const chainQuery = useQuery({
        queryKey: chainQueryKey,
        queryFn: () => aiJobsApi.chain(request.jobId!, { silent: true }),
        refetchInterval: query => (query.state.data?.some(job => isAiJobActive(job.status) || job.repositories.some(repository => isActive(repository.status))) ? POLL_INTERVAL_MS : false),
        // Not polled once settled: a follow-up sent from the assistant or another tab shows up when the user comes back.
        refetchOnWindowFocus: true
    })

    // A conversation started on a domain may go on with other repositories only: keep the messages that worked on this one.
    const turns: Turn[] = (chainQuery.data ?? []).flatMap(job => {
        const repository = job.repositories.find(candidate => candidate.microfrontendId === target.id)
        return repository ? [{ job, repository }] : []
    })
    const first = turns[0]
    const latest = turns[turns.length - 1]
    const busy = turns.some(isTurnActive)
    // A failed follow-up leaves the proposal before it open: the latest one still proposed is reviewed and refined, none while the agent works.
    const open = busy ? undefined : [...turns].reverse().find(turn => turn.job.status === "DONE" && turn.repository.status === "PROPOSED")
    // Where the conversation stands: what the agent does, else what was applied (a later failed follow-up does not undo it), else the open proposal.
    const current = busy ? latest : (turns.find(turn => turn.repository.status === "APPLIED") ?? open ?? latest)

    const proposalQuery = useQuery({
        queryKey: ["ai-change", open?.repository.requestId],
        queryFn: () => aiChangesApi.getSingle(open!.repository.requestId),
        enabled: Boolean(open)
    })

    // The queue only shows statuses: refresh it once the agent is done.
    const wasBusy = useRef(false)
    // biome-ignore lint/correctness/useExhaustiveDependencies: only the end of the work decides, the callback is new on every render
    useEffect(() => {
        if (busy) wasBusy.current = true
        else if (wasBusy.current) {
            wasBusy.current = false
            onQueueChanged()
        }
    }, [busy])

    const onSent = (child: AiJob) => {
        // Shown at once, then followed by polling: the new message is active.
        queryClient.setQueryData<AiJob[]>(chainQueryKey, chain => (chain ? [...chain, child] : chain))
        queryClient.invalidateQueries({ queryKey: chainQueryKey })
        onQueueChanged()
    }

    const onProposalUpdated = (updated: AiChangeRequest) => {
        queryClient.setQueryData(["ai-change", updated._id], updated)
        chainQuery.refetch()
        onQueueChanged()
    }

    const onConflict = () => {
        proposalQuery.refetch()
        chainQuery.refetch()
        onQueueChanged()
    }

    if (chainQuery.isPending) {
        return (
            <div className="flex justify-center py-6">
                <Spinner size={24} centerScreen={false} label={t("common.loading")} />
            </div>
        )
    }

    if (!first || !latest || !current) return fallback

    let proposal: React.ReactNode
    // The cache may still hold the request as it was while the agent worked: wait for the proposal itself.
    if (open && proposalQuery.data?.status === "PROPOSED") {
        proposal = <Proposal key={proposalQuery.data.updatedAt} request={proposalQuery.data} onApplied={onProposalUpdated} onDiscarded={onProposalUpdated} onConflict={onConflict} />
    } else if (open && proposalQuery.isError) {
        proposal = (
            <Alert variant="destructive">
                <AlertDescription>{t("microfrontend.aiChange.errors.load")}</AlertDescription>
            </Alert>
        )
    } else if (open) {
        proposal = <Spinner size={24} centerScreen={false} label={t("common.loading")} />
    }

    const followUpState = busy ? "running" : open ? "placeholder" : current.repository.status === "FAILED" ? "failed" : "closed"
    const closed = !busy && !open && (current.repository.status === "FAILED" || current.repository.status === "DISCARDED")

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="mb-0 line-clamp-3 break-words text-base leading-snug" title={firstLine(first.job.prompt)}>
                            {firstLine(first.job.prompt)}
                        </CardTitle>
                        <CardDescription>
                            {t("microfrontend.aiChange.request_meta", {
                                date: format(new Date(first.job.createdAt), "PPp", { locale: themeStore.getLocale() }),
                                branch: request.baseBranch
                            })}
                        </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <JobBadge request={request} />
                        <StatusBadge status={current.repository.status} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 pt-3">
                <ol aria-label={t("microfrontend.aiChange.conversation_label")} className="flex flex-col gap-8">
                    {turns.map((turn, index) => (
                        <li key={turn.job._id}>
                            <TurnView
                                turn={turn}
                                superseded={turn.repository.status === "DISCARDED" && turns.slice(index + 1).some(later => later.job.status === "DONE" && later.repository.status !== "FAILED")}
                                proposal={turn === open ? proposal : undefined}
                            />
                        </li>
                    ))}
                </ol>

                {turns.length > 1 && (
                    <AnswerUsage
                        usage={sumUsage(turns.map(turn => turn.job))}
                        label={t("microfrontend.aiChange.usage_conversation", { count: turns.length })}
                        hint={t("microfrontend.aiChange.usage_hint")}
                    />
                )}

                {/* Nothing left to refine: start over with everything asked so far. */}
                {closed && (
                    <div className="flex justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() =>
                                onRetry(
                                    turns
                                        .map(turn => turn.job.prompt)
                                        .join("\n\n")
                                        .slice(0, PROMPT_MAX_LENGTH),
                                    request.baseBranch
                                )
                            }
                        >
                            <RotateCcw aria-hidden="true" />
                            {t("microfrontend.aiChange.try_again")}
                        </Button>
                    </div>
                )}

                <FollowUpForm target={target} open={open} placeholder={t(`microfrontend.aiChange.follow_up_${followUpState}`)} onSent={onSent} onFailed={() => chainQuery.refetch()} />
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

/** The requests of the queue grouped by conversation: one entry each. The backend lists conversations whole. */
interface Conversation {
    /** The oldest request: what the conversation is about. */
    first: AiChangeRequest
    /** The newest one: when the conversation last moved. */
    latest: AiChangeRequest
    /** Where it stands: the request the agent works on, else the proposal to review, else the newest. */
    current: AiChangeRequest
    ids: string[]
}

/** The requests come newest first, and so do the conversations: by their newest request. */
const conversationsOf = (requests: AiChangeRequest[]): Conversation[] => {
    const chains = new Map<string, AiChangeRequest[]>()
    for (const request of requests) chains.set(request.conversationId, [...(chains.get(request.conversationId) ?? []), request])
    return [...chains.values()].map(chain => ({
        first: chain[chain.length - 1],
        latest: chain[0],
        current: chain.find(request => isActive(request.status)) ?? chain.find(request => request.status === "PROPOSED") ?? chain.find(request => request.status === "APPLIED") ?? chain[0],
        ids: chain.map(request => request._id)
    }))
}

const QueueItem: React.FC<{ conversation: Conversation; selected: boolean; onSelect: () => void }> = ({ conversation, selected, onSelect }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    const { first, latest, current, ids } = conversation
    return (
        <li>
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                // The label replaces the content of the button: it has to carry the status the badges show.
                aria-label={`${t("microfrontend.aiChange.open_request", { prompt: firstLine(first.prompt) })} · ${t(`microfrontend.aiChange.status.${current.status}`)}`}
                onClick={onSelect}
                className={cn(
                    "flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-primary/5" : "border-divider hover:border-primary/50 hover:bg-muted/40"
                )}
            >
                <span className="line-clamp-2 break-words text-sm font-medium">{firstLine(first.prompt)}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <time dateTime={latest.createdAt}>{format(new Date(latest.createdAt), "PPp", { locale: themeStore.getLocale() })}</time>
                    {ids.length > 1 && <span>· {t("microfrontend.aiChange.turns_count", { count: ids.length })}</span>}
                    {current.files.length > 0 && <span>· {t("microfrontend.aiChange.files_count", { count: current.files.length })}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={current.status} />
                    <JobBadge request={current} />
                </span>
            </button>
        </li>
    )
}

interface QueueSectionProps {
    group: QueueGroup
    conversations: Conversation[]
    selectedId: string
    onSelect: (id: string) => void
}

const QueueSection: React.FC<QueueSectionProps> = ({ group, conversations, selectedId, onSelect }) => {
    const { t } = useTranslation()
    const headingId = useId()
    const Icon = GROUP_ICON[group]
    const containsSelected = conversations.some(conversation => conversation.ids.includes(selectedId))
    const [historyOpen, setHistoryOpen] = useState(containsSelected)

    // A request of the group opened from elsewhere (a deep link): unfold it. Never fold it back on the user.
    useEffect(() => {
        if (containsSelected) setHistoryOpen(true)
    }, [containsSelected])
    const heading = (
        <span className="flex items-center justify-between gap-2">
            <span id={headingId} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                <Icon className={cn("size-3.5", group === "active" && conversations.length > 0 && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                {t(`microfrontend.aiChange.groups.${group}`)}
            </span>
            <Badge variant={group === "review" && conversations.length > 0 ? "accent" : "outline"}>{conversations.length}</Badge>
        </span>
    )
    const list =
        conversations.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t(`microfrontend.aiChange.group_empty.${group}`)}</p>
        ) : (
            <ul aria-labelledby={headingId} className="flex flex-col gap-1.5">
                {conversations.map(conversation => (
                    <QueueItem
                        key={conversation.first._id}
                        conversation={conversation}
                        selected={conversation.ids.includes(selectedId)}
                        // Already open: any request of it shows the whole conversation, and reopening it would drop the draft.
                        onSelect={() => !conversation.ids.includes(selectedId) && onSelect(conversation.current._id)}
                    />
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
    name: string
    /** Picks the wording of a service where it differs (`_service` keys). */
    kind: AiChangeTarget["kind"]
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

const Composer: React.FC<ComposerProps> = ({ name, kind, prompt, baseBranch, onPromptChange, onBaseBranchChange, onSubmit, pending, error, promptRef, focusOnMount }) => {
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
                        {t("microfrontend.aiChange.composer_title", { name })}
                    </CardTitle>
                    <CardDescription>{t("microfrontend.aiChange.description", { context: kind === "service" ? "service" : undefined })}</CardDescription>
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
    /** The microfrontend or the service whose repository the agent works on. */
    target: AiChangeTarget
    name: string
}

/**
 * The "Edit with AI" workspace of a microfrontend (its landing screen) or of a service: the queue of its requests on one side
 * (waiting for review, in progress, discarded, done) and the selected one, or a new request, on the other.
 * The selection lives in `?change=`, so the assistant can link a job straight to its diff.
 */
export const AiChangeWorkspace: React.FC<AiChangeWorkspaceProps> = ({ target, name }) => {
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

    const historyQueryKey = ["ai-changes", target.id]

    const historyQuery = useQuery({
        queryKey: historyQueryKey,
        queryFn: () => aiChangesApi.getByTarget(target),
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
        // A request of a job is followed through its conversation: only one made before jobs is polled here.
        refetchInterval: query => (!query.state.data?.jobId && isActive(query.state.data?.status) ? POLL_INTERVAL_MS : false)
    })

    // The queue only shows statuses: refresh it when the polled request settles, not on every finished request opened.
    const status = requestQuery.data?.status
    const wasActive = useRef(false)
    useEffect(() => {
        if (isActive(status)) wasActive.current = true
        else if (status && wasActive.current) {
            wasActive.current = false
            queryClient.invalidateQueries({ queryKey: ["ai-changes", target.id] })
        }
    }, [status, target.id, queryClient])

    const createMutation = useMutation({
        mutationFn: () =>
            aiChangesApi.create(
                target,
                { prompt: prompt.trim(), baseBranch: baseBranch.trim() || undefined },
                {
                    customErrorMessage: error => {
                        const code = errorCodeOf(error)
                        return code && CREATE_ERROR_CODES.has(code)
                            ? t(`microfrontend.aiChange.errors.${code}`, { context: target.kind === "service" ? "service" : undefined })
                            : t("microfrontend.aiChange.errors.create")
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

    const retry = (retriedPrompt: string, retriedBaseBranch: string) => {
        setPrompt(retriedPrompt)
        setBaseBranch(retriedBaseBranch)
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

    const conversations = conversationsOf(historyQuery.data ?? [])
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
                        <QueueSection
                            key={group}
                            group={group}
                            conversations={conversations.filter(conversation => groupOf(conversation.current.status) === group)}
                            selectedId={linkedId ?? ""}
                            onSelect={select}
                        />
                    ))}
            </aside>

            <div className="min-w-0">
                {(linkedId === NEW_CHANGE || (!linkedId && historyQuery.data?.length === 0)) && (
                    <Composer
                        name={name}
                        kind={target.kind}
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
                {selectedId &&
                    requestQuery.data &&
                    (requestQuery.data.jobId ? (
                        <ChangeThread
                            key={requestQuery.data.conversationId}
                            request={requestQuery.data}
                            target={target}
                            onRetry={retry}
                            onQueueChanged={() => queryClient.invalidateQueries({ queryKey: historyQueryKey })}
                            fallback={<RequestView request={requestQuery.data} onRetry={retry} onUpdated={onUpdated} onConflict={onConflict} />}
                        />
                    ) : (
                        <RequestView request={requestQuery.data} onRetry={retry} onUpdated={onUpdated} onConflict={onConflict} />
                    ))}
            </div>
        </div>
    )
}

export default AiChangeWorkspace
