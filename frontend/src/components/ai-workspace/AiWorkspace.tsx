import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, Spinner, Textarea } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AxiosError } from "axios"
import { format } from "date-fns"
import {
    AlertTriangle,
    ArrowUp,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ClipboardCheck,
    ExternalLink,
    GitBranch,
    GitMerge,
    GitPullRequest,
    LoaderCircle,
    Plus,
    RotateCcw,
    Sparkles,
    Trash2
} from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import AiModelSelect from "@/components/assistant/AiModelSelect"
import AnswerUsage from "@/components/assistant/AnswerUsage"
import { jobErrorMessage, sumUsage } from "@/components/assistant/AssistantJobThread"
import AssistantMessageText from "@/components/assistant/AssistantMessageText"
import EffortSelect from "@/components/assistant/EffortSelect"
import { useEffort, useFollowUpAiModel, useFollowUpEffort } from "@/components/assistant/useEffort"
import useProjectAiModels from "@/components/assistant/useProjectAiModels"
import type { IBadgeProps } from "@/components/atoms"
import { Badge, Button } from "@/components/atoms"
import useAiChangesApi, { AI_CHANGE_ACTIVE_STATUSES, AiChangeFile, AiChangeRequest, AiChangeStatus } from "@/hooks/apiClients/useAiChangesApi"
import useAiJobsApi, { AiJob, AiJobRepository, isAiJobActive } from "@/hooks/apiClients/useAiJobsApi"
import { effortsOf } from "@/hooks/apiClients/useAiModelsApi"
import { errorCodeOf } from "@/hooks/useApiClient"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { cn } from "@/utils/styleUtils"
import { AiChangeDiff } from "./AiChangeDiff"
import { ProgressLog, StatusBadge } from "./AiChangeProgress"
import { AiWorkspaceRepository, BaseBranches, RepositoryBranches } from "./RepositoryBranches"

const PROMPT_MAX_LENGTH = 8000
const POLL_INTERVAL_MS = 2000

/** Error codes of the create endpoint that have a message of their own. */
const CREATE_ERROR_CODES = new Set(["ASSISTANT_DISABLED", "AI_CHANGE_FORBIDDEN", "WORKSPACE_NO_REPOSITORY", "AI_MODEL_NOT_AVAILABLE"])

const ACTION_VARIANT: Record<AiChangeFile["action"], IBadgeProps["variant"]> = {
    create: "accent",
    update: "outline",
    delete: "destructive"
}

const isActive = (status?: AiChangeStatus) => Boolean(status && AI_CHANGE_ACTIVE_STATUSES.includes(status))

/** Still moving: the agent works, or a proposal is being pushed. */
const isJobBusy = (job: AiJob) => isAiJobActive(job.status) || job.repositories.some(repository => isActive(repository.status))

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

const PullRequestLink: React.FC<{ url: string }> = ({ url }) => {
    const { t } = useTranslation()
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            {t("microfrontend.aiChange.view_pull_request")}
            <ExternalLink className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("microfrontend.aiChange.opens_new_tab")}</span>
        </a>
    )
}

const AppliedAlert: React.FC<{ baseBranch: string; commit?: string; pullRequestUrl?: string }> = ({ baseBranch, commit, pullRequestUrl }) => {
    const { t } = useTranslation()
    return (
        <Alert>
            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" aria-hidden="true" />
            <AlertTitle>{t("microfrontend.aiChange.applied_title")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
                <span>
                    {t("microfrontend.aiChange.applied_onto")} <code className="font-mono text-xs">{baseBranch}</code>
                    {commit && <code className="ml-2 font-mono text-xs text-muted-foreground">{commit.slice(0, 7)}</code>}
                </span>
                {pullRequestUrl && <PullRequestLink url={pullRequestUrl} />}
            </AlertDescription>
        </Alert>
    )
}

/** Where the proposal is in the repository already: its feature branch, or why it is not there. */
const BranchStatus: React.FC<{ request: AiChangeRequest }> = ({ request }) => {
    const { t } = useTranslation()
    if (request.pushError) return <WarningAlert title={t("microfrontend.aiChange.push_error_title")}>{request.pushError}</WarningAlert>
    if (!request.branch || !request.commit) return null
    return (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-foreground-secondary">
            <GitBranch className="size-4 shrink-0" aria-hidden="true" />
            {t("microfrontend.aiChange.pushed_on")} <code className="break-all font-mono text-xs">{request.branch}</code>
        </p>
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
                    if (code === "AI_CHANGE_PUSH_REFUSED") return t("microfrontend.aiChange.errors.AI_CHANGE_PUSH_REFUSED", { branch: request.baseBranch })
                    return t("microfrontend.aiChange.errors.apply")
                }
            }),
        onSuccess: applied => {
            notifications.showSuccessNotification({ message: t("microfrontend.aiChange.applied_success", { branch: request.baseBranch }) })
            onApplied(applied)
        },
        onError: () => onConflict()
    })

    const pullRequestMutation = useMutation({
        mutationFn: () =>
            aiChangesApi.openPullRequest(request._id, {
                customErrorMessage: error => {
                    const code = errorCodeOf(error)
                    if (code === "AI_CHANGE_CONFLICT") return t("microfrontend.aiChange.errors.AI_CHANGE_CONFLICT", { files: conflictsOf(error).join(", ") })
                    if (code === "AI_CHANGE_NOT_PROPOSED") return t("microfrontend.aiChange.errors.AI_CHANGE_NOT_PROPOSED")
                    return t("microfrontend.aiChange.errors.pull_request")
                }
            }),
        onSuccess: opened => {
            // A provider refusing it answers with the error on the proposal: it shows there.
            if (opened.pullRequestUrl) notifications.showSuccessNotification({ message: t("microfrontend.aiChange.pull_request_opened") })
            onApplied(opened)
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

    const busy = applyMutation.isPending || discardMutation.isPending || pullRequestMutation.isPending

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
            <BranchStatus request={request} />
            {request.pullRequestError && <WarningAlert title={t("microfrontend.aiChange.pull_request_error_title")}>{request.pullRequestError}</WarningAlert>}
            <p className="text-sm text-foreground-secondary">{t("microfrontend.aiChange.apply_description", { branch: request.baseBranch })}</p>
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => discardMutation.mutate()}>
                    <Trash2 aria-hidden="true" />
                    {t("microfrontend.aiChange.discard")}
                </Button>
                {request.pullRequestUrl ? (
                    <PullRequestLink url={request.pullRequestUrl} />
                ) : (
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => pullRequestMutation.mutate()}>
                        {pullRequestMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <GitPullRequest aria-hidden="true" />}
                        {t("microfrontend.aiChange.open_pull_request")}
                    </Button>
                )}
                <Button type="button" disabled={busy} onClick={() => applyMutation.mutate()}>
                    {applyMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <GitMerge aria-hidden="true" />}
                    {t("microfrontend.aiChange.apply", { branch: request.baseBranch })}
                </Button>
            </div>
        </div>
    )
}

interface RepositoryProposalProps {
    requestId: string
    onUpdated: (request: AiChangeRequest) => void
    onConflict: () => void
}

/** The open proposal of one repository: the job only lists its files, the request carries their contents. */
const RepositoryProposal: React.FC<RepositoryProposalProps> = ({ requestId, onUpdated, onConflict }) => {
    const { t } = useTranslation()
    const aiChangesApi = useAiChangesApi()
    const proposalQuery = useQuery({ queryKey: ["ai-change", requestId], queryFn: () => aiChangesApi.getSingle(requestId) })

    // The cache may still hold the request as it was while the agent worked: wait for the proposal itself.
    if (proposalQuery.data?.status === "PROPOSED") {
        return (
            <Proposal
                key={proposalQuery.data.updatedAt}
                request={proposalQuery.data}
                onApplied={onUpdated}
                onDiscarded={onUpdated}
                onConflict={() => {
                    proposalQuery.refetch()
                    onConflict()
                }}
            />
        )
    }
    if (proposalQuery.isError) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{t("microfrontend.aiChange.errors.load")}</AlertDescription>
            </Alert>
        )
    }
    return <Spinner size={24} centerScreen={false} label={t("common.loading")} />
}

/** A request made before requests became conversations: it has no job to follow up on. */
interface RequestViewProps {
    request: AiChangeRequest
    onRetry: (prompt: string, baseBranches?: BaseBranches) => void
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

                {request.status === "APPLIED" && <AppliedAlert baseBranch={request.baseBranch} commit={request.commit} pullRequestUrl={request.pullRequestUrl} />}

                {request.status === "DISCARDED" && <p className="text-sm text-muted-foreground">{t("microfrontend.aiChange.discarded_description")}</p>}

                {request.summary && finished && (
                    <div className="flex flex-col gap-1">
                        <h4 className="text-sm font-semibold">{t("microfrontend.aiChange.summary")}</h4>
                        <AssistantMessageText text={request.summary} className="text-sm" />
                    </div>
                )}

                {request.status === "PROPOSED" && <Proposal key={request.updatedAt} request={request} onApplied={onUpdated} onDiscarded={onUpdated} onConflict={onConflict} />}

                {(request.status === "FAILED" || request.status === "DISCARDED") && (
                    <div className="flex justify-end">
                        <Button type="button" variant="secondary" onClick={() => onRetry(request.prompt, { [request.microfrontendId]: request.baseBranch })}>
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
                            effort={request.effort}
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

/** One message of a conversation: what the user asked, and what the agent did with it on the repositories the workspace shows. */
interface Turn {
    job: AiJob
    repositories: AiJobRepository[]
}

/** Still moving: the agent works, or a proposal is being pushed. */
const isTurnActive = (turn: Turn) => isAiJobActive(turn.job.status) || turn.repositories.some(repository => isActive(repository.status))

/** Over several repositories, what needs the user comes before what is settled. */
const STATUS_PRECEDENCE: AiChangeStatus[] = ["PENDING", "RUNNING", "APPLYING", "PROPOSED", "APPLIED", "FAILED"]

/** Where a message stands: the status of its repository, or, over several, the most pressing of theirs. */
const turnStatus = ({ job, repositories }: Turn): AiChangeStatus => {
    if (job.status === "PENDING" || job.status === "RUNNING") return job.status
    return STATUS_PRECEDENCE.find(status => repositories.some(repository => repository.status === status)) ?? (job.status === "FAILED" ? "FAILED" : "DISCARDED")
}

interface RepositoryResultProps {
    job: AiJob
    repository: AiJobRepository
    /** Refined by a later message: its files went on into the next proposal. */
    superseded: boolean
    /** The diff and its actions, while its proposal is open for review. */
    proposal?: React.ReactNode
}

/** What the agent did with a message on one repository. */
const RepositoryResult: React.FC<RepositoryResultProps> = ({ job, repository, superseded, proposal }) => {
    const { t } = useTranslation()

    return (
        <>
            {isActive(repository.status) && (
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

            {repository.status === "PROPOSED" && repository.error && <WarningAlert title={t("microfrontend.aiChange.proposal_warning")}>{repository.error}</WarningAlert>}

            {proposal}

            {repository.status === "APPLIED" && <AppliedAlert baseBranch={repository.baseBranch} commit={repository.commit} pullRequestUrl={repository.pullRequestUrl} />}

            {repository.status === "DISCARDED" && (
                <p className="text-sm text-muted-foreground">{t(superseded ? "microfrontend.aiChange.superseded" : "microfrontend.aiChange.discarded_description")}</p>
            )}
        </>
    )
}

interface TurnViewProps {
    turn: Turn
    /** The repositories whose result a later message refined. */
    superseded: Set<string>
    /** The diff and its actions of a repository, on the message whose proposals are open for review. */
    proposalOf?: (repository: AiJobRepository) => React.ReactNode
}

const TurnView: React.FC<TurnViewProps> = ({ turn, superseded, proposalOf }) => {
    const { t } = useTranslation()
    const { job, repositories } = turn
    const active = isTurnActive(turn)

    return (
        <div className="flex flex-col gap-3">
            <p className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-lg bg-primary/10 px-3 py-2 text-sm">{job.prompt}</p>

            {/* A job that failed before any repository could tell its own outcome. */}
            {job.status === "FAILED" && !repositories.some(repository => repository.status === "FAILED") && (
                <Alert variant="destructive">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    <AlertTitle>{t("microfrontend.aiChange.failed_title")}</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap break-words">{job.error || t("microfrontend.aiChange.errors.generic")}</AlertDescription>
                </Alert>
            )}

            {job.summary && !active && <AssistantMessageText text={job.summary} className="text-sm" />}

            {repositories.map(repository => (
                <RepositoryResult
                    key={repository.requestId}
                    job={job}
                    repository={repository}
                    superseded={superseded.has(repository.requestId)}
                    proposal={repository.status === "PROPOSED" ? proposalOf?.(repository) : undefined}
                />
            ))}

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
                    <AnswerUsage usage={job.usage} label={t("microfrontend.aiChange.usage_label")} hint={t("microfrontend.aiChange.usage_hint")} effort={job.effort} />
                    {/* Part of a wider job: the repositories not shown here share its cost. */}
                    {repositories.length < job.repositories.length && <p className="text-xs text-muted-foreground">{t("microfrontend.aiChange.usage_shared", { count: job.repositories.length })}</p>}
                </div>
            )}
        </div>
    )
}

interface FollowUpFormProps {
    /** A follow-up goes on with this microfrontend only: the others of a job over several go on from their own page, or from the assistant. */
    microfrontendId: string
    /** The message whose proposal a follow-up refines: none while the agent works or once nothing is left to refine. */
    open?: Turn
    /** The latest message: while nothing is open, its effort is shown, the one the running follow-up was sent with. */
    latest?: Turn
    placeholder: string
    onSent: (child: AiJob) => void
    /** Refused: the conversation most likely moved on elsewhere (the assistant, another tab). */
    onFailed: () => void
}

/** Goes on with the conversation: a follow-up starts from the open proposal and replaces it once it proposes. */
const FollowUpForm: React.FC<FollowUpFormProps> = ({ microfrontendId, open, latest, placeholder, onSent, onFailed }) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const [draft, setDraft] = useState("")
    const [aiModel, setAiModel] = useFollowUpAiModel((open ?? latest)?.job)
    const [effort, setEffort] = useFollowUpEffort((open ?? latest)?.job, aiModel)
    const promptId = useId()
    const locked = !open

    const followUpMutation = useMutation({
        mutationFn: ({ jobId, prompt }: { jobId: string; prompt: string }) =>
            aiJobsApi.followUp(jobId, { prompt, effort, aiModelId: aiModel?.id, microfrontendIds: [microfrontendId] }, { customErrorMessage: error => jobErrorMessage(t, error, "follow_up") }),
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
            <AiModelSelect value={aiModel?.id} onChange={setAiModel} disabled={locked || followUpMutation.isPending} dataTestId="ai-change-follow-up-ai-model" />
            <EffortSelect value={effort} onChange={setEffort} efforts={effortsOf(aiModel)} disabled={locked || followUpMutation.isPending} dataTestId="ai-change-follow-up-effort" />
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

interface ConversationThreadProps {
    /** Any job of the conversation: its whole chain of follow-ups is fetched from it. */
    jobId: string
    /** The first job of the chain. */
    conversationId: string
    microfrontendId: string
    /** Where the agent started from. */
    baseBranch: string
    /** Next to the status: a request of a job over several repositories says so. */
    badge?: React.ReactNode
    onRetry: (prompt: string, baseBranches?: BaseBranches) => void
    /** Something the queue shows has changed: a new message, a proposal ready, applied or discarded. */
    onQueueChanged: () => void
    /** Shown when the conversation cannot be loaded (its jobs expired). */
    fallback: React.ReactNode
}

/**
 * A conversation with the agent: every message with what it did on the repository of the microfrontend, the latest
 * proposal to review, and the input to refine it further before applying it.
 */
const ConversationThread: React.FC<ConversationThreadProps> = ({ jobId, conversationId, microfrontendId, baseBranch, badge, onRetry, onQueueChanged, fallback }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    const aiJobsApi = useAiJobsApi()
    const queryClient = useQueryClient()
    // By conversation: any of its requests opens the same thread, from the same cache.
    const chainQueryKey = ["ai-change-thread", conversationId]

    const chainQuery = useQuery({
        queryKey: chainQueryKey,
        queryFn: () => aiJobsApi.chain(jobId, { silent: true }),
        refetchInterval: query => (query.state.data?.some(isJobBusy) ? POLL_INTERVAL_MS : false),
        // Not polled once settled: a follow-up sent from the assistant or another tab shows up when the user comes back.
        refetchOnWindowFocus: true
    })

    // A conversation started from the assistant may go on with other microfrontends only: keep the messages that worked on this one.
    const turns: Turn[] = (chainQuery.data ?? []).flatMap(job => {
        const repositories = job.repositories.filter(candidate => candidate.microfrontendId === microfrontendId)
        return repositories.length > 0 ? [{ job, repositories }] : []
    })
    const first = turns[0]
    const latest = turns[turns.length - 1]
    const busy = turns.some(isTurnActive)
    // Nothing is reviewed or refined while the agent works.
    const agentWorking = turns.some(turn => isAiJobActive(turn.job.status))
    // A failed follow-up leaves the proposal before it open: the latest one still proposed is refined.
    const open = agentWorking ? undefined : [...turns].reverse().find(turn => turn.job.status === "DONE" && turn.repositories.some(repository => repository.status === "PROPOSED"))
    // Where the conversation stands: what the agent does, else the open proposal, else what is pushed or was applied (a later failed follow-up does not undo it).
    const current = agentWorking ? latest : (open ?? turns.find(turn => turn.repositories.some(repository => repository.status === "APPLYING" || repository.status === "APPLIED")) ?? latest)

    // The queue only shows statuses; the assistant panel follows the same jobs from a cache of its own.
    const changed = () => {
        onQueueChanged()
        queryClient.invalidateQueries({ queryKey: ["ai-job-chain"] })
    }

    // Refresh them once the agent is done.
    const wasBusy = useRef(false)
    // biome-ignore lint/correctness/useExhaustiveDependencies: only the end of the work decides, the callback is new on every render
    useEffect(() => {
        if (busy) wasBusy.current = true
        else if (wasBusy.current) {
            wasBusy.current = false
            changed()
        }
    }, [busy])

    const onSent = (child: AiJob) => {
        // Shown at once, then followed by polling: the new message is active.
        queryClient.setQueryData<AiJob[]>(chainQueryKey, chain => (chain ? [...chain, child] : chain))
        queryClient.invalidateQueries({ queryKey: chainQueryKey })
        changed()
    }

    const onProposalUpdated = (updated: AiChangeRequest) => {
        queryClient.setQueryData(["ai-change", updated._id], updated)
        chainQuery.refetch()
        changed()
    }

    const onConflict = () => {
        chainQuery.refetch()
        changed()
    }

    if (chainQuery.isPending) {
        return (
            <div className="flex justify-center py-6">
                <Spinner size={24} centerScreen={false} label={t("common.loading")} />
            </div>
        )
    }

    if (!first || !latest || !current) return fallback

    const status = turnStatus(current)
    const followUpState = open ? "placeholder" : busy ? "running" : status === "FAILED" ? "failed" : "closed"
    const closed = !busy && !open && (status === "FAILED" || status === "DISCARDED")
    const date = format(new Date(first.job.createdAt), "PPp", { locale: themeStore.getLocale() })

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <CardTitle className="mb-0 line-clamp-3 break-words text-base leading-snug" title={firstLine(first.job.prompt)}>
                            {firstLine(first.job.prompt)}
                        </CardTitle>
                        <CardDescription>{t("microfrontend.aiChange.request_meta", { date, branch: baseBranch })}</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {badge}
                        <StatusBadge status={status} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 pt-3">
                <ol aria-label={t("microfrontend.aiChange.conversation_label")} className="flex flex-col gap-8">
                    {turns.map((turn, index) => {
                        const later = turns.slice(index + 1).filter(candidate => candidate.job.status === "DONE")
                        const superseded = new Set(
                            turn.repositories
                                .filter(
                                    repository =>
                                        repository.status === "DISCARDED" &&
                                        later.some(candidate => candidate.repositories.some(next => next.microfrontendId === repository.microfrontendId && next.status !== "FAILED"))
                                )
                                .map(repository => repository.requestId)
                        )
                        return (
                            <li key={turn.job._id}>
                                <TurnView
                                    turn={turn}
                                    superseded={superseded}
                                    proposalOf={
                                        !agentWorking && turn.job.status === "DONE"
                                            ? repository => <RepositoryProposal requestId={repository.requestId} onUpdated={onProposalUpdated} onConflict={onConflict} />
                                            : undefined
                                    }
                                />
                            </li>
                        )
                    })}
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
                                    Object.fromEntries((first?.repositories ?? []).map(repository => [repository.microfrontendId, repository.baseBranch]))
                                )
                            }
                        >
                            <RotateCcw aria-hidden="true" />
                            {t("microfrontend.aiChange.try_again")}
                        </Button>
                    </div>
                )}

                <FollowUpForm
                    microfrontendId={microfrontendId}
                    open={open}
                    latest={latest}
                    placeholder={t(`microfrontend.aiChange.follow_up_${followUpState}`)}
                    onSent={onSent}
                    onFailed={() => chainQuery.refetch()}
                />
            </CardContent>
        </Card>
    )
}

interface RequestSelectionProps {
    requestId: string
    microfrontendId: string
    onRetry: (prompt: string, baseBranches?: BaseBranches) => void
    onQueueChanged: () => void
}

/** A request opened on the microfrontend: the conversation of its job, or the request alone when it was made before jobs. */
const RequestSelection: React.FC<RequestSelectionProps> = ({ requestId, microfrontendId, onRetry, onQueueChanged }) => {
    const { t } = useTranslation()
    const aiChangesApi = useAiChangesApi()
    const queryClient = useQueryClient()

    const requestQuery = useQuery({
        queryKey: ["ai-change", requestId],
        queryFn: () => aiChangesApi.getSingle(requestId),
        // A request of a job is followed through its conversation: only one made before jobs is polled here.
        refetchInterval: query => (!query.state.data?.jobId && isActive(query.state.data?.status) ? POLL_INTERVAL_MS : false)
    })

    // The queue only shows statuses: refresh it when the polled request settles, not on every finished request opened.
    const status = requestQuery.data?.status
    const wasActive = useRef(false)
    // biome-ignore lint/correctness/useExhaustiveDependencies: only the status decides, the callback is new on every render
    useEffect(() => {
        if (isActive(status)) wasActive.current = true
        else if (status && wasActive.current) {
            wasActive.current = false
            onQueueChanged()
        }
    }, [status])

    const onUpdated = (request: AiChangeRequest) => {
        queryClient.setQueryData(["ai-change", request._id], request)
        onQueueChanged()
    }

    const onConflict = () => {
        requestQuery.refetch()
        onQueueChanged()
    }

    if (requestQuery.isPending) {
        return (
            <div className="flex justify-center py-6">
                <Spinner size={24} centerScreen={false} label={t("common.loading")} />
            </div>
        )
    }

    if (requestQuery.isError) {
        return (
            <Alert variant="destructive">
                <AlertDescription>{t("microfrontend.aiChange.errors.load")}</AlertDescription>
            </Alert>
        )
    }

    const request = requestQuery.data
    const view = <RequestView request={request} onRetry={onRetry} onUpdated={onUpdated} onConflict={onConflict} />
    if (!request.jobId) return view

    return (
        <ConversationThread
            key={request.conversationId}
            jobId={request.jobId}
            conversationId={request.conversationId}
            microfrontendId={microfrontendId}
            baseBranch={request.baseBranch}
            badge={<JobBadge request={request} />}
            onRetry={onRetry}
            onQueueChanged={onQueueChanged}
            fallback={view}
        />
    )
}

/** The value of `?change=` that opens the composer instead of a conversation. */
const NEW_CHANGE = "new"

/** The queue groups conversations by what they wait for: the user's review, the agent, or nothing at all. */
type QueueGroup = "review" | "active" | "discarded" | "applied" | "failed"

const groupOf = (status: AiChangeStatus): QueueGroup => {
    if (status === "PROPOSED") return "review"
    if (isActive(status)) return "active"
    if (status === "DISCARDED") return "discarded"
    if (status === "APPLIED") return "applied"
    return "failed"
}

const GROUP_ICON: Record<QueueGroup, React.FC<{ className?: string }>> = {
    review: ClipboardCheck,
    active: LoaderCircle,
    discarded: Trash2,
    applied: CheckCircle2,
    failed: AlertTriangle
}

/** One conversation in the queue. */
interface QueueEntry {
    /** What `?change=` holds to open it. */
    id: string
    /** Every value of `?change=` that opens it: any request of the conversation does. */
    ids: string[]
    /** The first request: what the conversation is about. */
    prompt: string
    /** When it last moved. */
    at: string
    status: AiChangeStatus
    turns?: number
    files?: number
    /** Next to the status. */
    badge?: React.ReactNode
}

/** The microfrontend lists its requests, newest first; a conversation is one entry, opened on where it stands: the request the agent works on, else the proposal to review, else the newest. */
const requestEntries = (requests: AiChangeRequest[]): QueueEntry[] => {
    const chains = new Map<string, AiChangeRequest[]>()
    for (const request of requests) chains.set(request.conversationId, [...(chains.get(request.conversationId) ?? []), request])
    return [...chains.values()].map(chain => {
        const current = chain.find(request => isActive(request.status)) ?? chain.find(request => request.status === "PROPOSED") ?? chain.find(request => request.status === "APPLIED") ?? chain[0]
        return {
            id: current._id,
            ids: chain.map(request => request._id),
            prompt: chain[chain.length - 1].prompt,
            at: chain[0].createdAt,
            status: current.status,
            turns: chain.length,
            files: current.files.length,
            badge: <JobBadge request={current} />
        }
    })
}

/** What opens when nothing is linked: a proposal to review first, then work in progress, otherwise a new request. */
const defaultSelection = (entries: QueueEntry[]) => entries.find(entry => entry.status === "PROPOSED")?.id ?? entries.find(entry => isActive(entry.status))?.id ?? NEW_CHANGE

const QueueItem: React.FC<{ entry: QueueEntry; selected: boolean; onSelect: () => void }> = ({ entry, selected, onSelect }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    return (
        <li>
            <button
                type="button"
                aria-current={selected ? "true" : undefined}
                // The label replaces the content of the button: it has to carry the status the badges show.
                aria-label={`${t("microfrontend.aiChange.open_request", { prompt: firstLine(entry.prompt) })} · ${t(`microfrontend.aiChange.status.${entry.status}`)}`}
                onClick={onSelect}
                className={cn(
                    "flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-primary/5" : "border-divider hover:border-primary/50 hover:bg-muted/40"
                )}
            >
                <span className="line-clamp-2 break-words text-sm font-medium">{firstLine(entry.prompt)}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <time dateTime={entry.at}>{format(new Date(entry.at), "PPp", { locale: themeStore.getLocale() })}</time>
                    {entry.turns !== undefined && entry.turns > 1 && <span>· {t("microfrontend.aiChange.turns_count", { count: entry.turns })}</span>}
                    {Boolean(entry.files) && <span>· {t("microfrontend.aiChange.files_count", { count: entry.files })}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={entry.status} />
                    {entry.badge}
                </span>
            </button>
        </li>
    )
}

interface QueueSectionProps {
    group: QueueGroup
    entries: QueueEntry[]
    selectedId: string
    onSelect: (id: string) => void
}

const QueueSection: React.FC<QueueSectionProps> = ({ group, entries, selectedId, onSelect }) => {
    const { t } = useTranslation()
    const headingId = useId()
    const Icon = GROUP_ICON[group]
    const containsSelected = entries.some(entry => entry.ids.includes(selectedId))
    const [open, setOpen] = useState(containsSelected)

    // A conversation of the group opened from elsewhere (a deep link): unfold it. Never fold it back on the user.
    useEffect(() => {
        if (containsSelected) setOpen(true)
    }, [containsSelected])
    const heading = (
        <span className="flex items-center justify-between gap-2">
            <span id={headingId} className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                <Icon className={cn("size-3.5", group === "active" && entries.length > 0 && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
                {t(`microfrontend.aiChange.groups.${group}`)}
            </span>
            <Badge variant={group === "review" && entries.length > 0 ? "accent" : "outline"}>{entries.length}</Badge>
        </span>
    )
    const list =
        entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t(`microfrontend.aiChange.group_empty.${group}`)}</p>
        ) : (
            <ul aria-labelledby={headingId} className="flex flex-col gap-1.5">
                {entries.map(entry => (
                    <QueueItem
                        key={entry.ids[entry.ids.length - 1]}
                        entry={entry}
                        selected={entry.ids.includes(selectedId)}
                        // Already open: any request of it shows the whole conversation, and reopening it would drop the draft.
                        onSelect={() => !entry.ids.includes(selectedId) && onSelect(entry.id)}
                    />
                ))}
            </ul>
        )

    // Applied and failed requests are done with: keep them out of the way unless one of them is open.
    if (group === "applied" || group === "failed") {
        return (
            <details open={open} onToggle={event => setOpen(event.currentTarget.open)}>
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
    prompt: string
    repositories: AiWorkspaceRepository[]
    baseBranches: BaseBranches
    onPromptChange: (value: string) => void
    onBaseBranchesChange: (value: BaseBranches) => void
    onSubmit: () => void
    pending: boolean
    error?: string
    promptRef: React.RefObject<HTMLTextAreaElement | null>
    /** Set when "New change" or "Try again" asked for the composer before it was on screen. */
    focusOnMount: React.RefObject<boolean>
}

const Composer: React.FC<ComposerProps> = ({ name, prompt, repositories, baseBranches, onPromptChange, onBaseBranchesChange, onSubmit, pending, error, promptRef, focusOnMount }) => {
    const { t } = useTranslation()
    const [effort, setEffort] = useEffort("code")
    const { selected: aiModel, setSelected: setAiModel } = useProjectAiModels()
    const promptId = useId()

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
                    <RepositoryBranches repositories={repositories} value={baseBranches} onChange={onBaseBranchesChange} disabled={pending} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground" aria-live="polite">
                            {t("microfrontend.aiChange.composer_shortcut")}
                        </span>
                        <div className="flex items-center gap-2">
                            <AiModelSelect value={aiModel?.id} onChange={setAiModel} disabled={pending} dataTestId="ai-change-ai-model" />
                            <EffortSelect value={effort} onChange={setEffort} disabled={pending} dataTestId="ai-change-effort" />
                            <Button type="submit" disabled={pending} dataTestId="ai-change-generate">
                                {pending ? <Spinner size={16} centerScreen={false} /> : <Sparkles aria-hidden="true" />}
                                {t("microfrontend.aiChange.generate")}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </form>
    )
}

interface AiWorkspaceProps {
    microfrontendId: string
    name: string
    /** The repository the agent works on, shown in the composer with the branch it starts from. */
    repositories: AiWorkspaceRepository[]
}

/**
 * "Edit with AI" on a microfrontend: the queue of the conversations with the agent on one side (waiting for review, in
 * progress, discarded, done) and the selected one, or a new request, on the other. The selection lives in `?change=`, so the assistant can link a job straight to its diff.
 */
export const AiWorkspace: React.FC<AiWorkspaceProps> = ({ microfrontendId, name, repositories }) => {
    const { t } = useTranslation()
    const aiChangesApi = useAiChangesApi()
    const queryClient = useQueryClient()
    const [prompt, setPrompt] = useState("")
    const [baseBranches, setBaseBranches] = useState<BaseBranches>({})
    // Picked in the composer, sent from here.
    const [effort] = useEffort("code")
    const aiModelId = useProjectAiModels().selected?.id
    const [submitted, setSubmitted] = useState(false)
    const [searchParams, setSearchParams] = useSearchParams()
    const promptRef = useRef<HTMLTextAreaElement>(null)
    const focusComposer = useRef(false)
    const linkedId = searchParams.get("change") ?? undefined

    // Jobs started from the assistant land here too: keep the queue moving while any agent works.
    const queueQuery = useQuery({
        queryKey: ["ai-changes", microfrontendId],
        queryFn: () => aiChangesApi.getByMicrofrontendId(microfrontendId),
        refetchInterval: query => (query.state.data?.some(request => isActive(request.status)) ? POLL_INTERVAL_MS * 2 : false)
    })
    const entries = requestEntries(queueQuery.data ?? [])
    const invalidateQueue = () => queryClient.invalidateQueries({ queryKey: ["ai-changes", microfrontendId] })

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
        if (!linkedId && queueQuery.data) select(defaultSelection(entries))
    }, [linkedId, queueQuery.data])

    const selectedId = linkedId && linkedId !== NEW_CHANGE ? linkedId : undefined

    const reset = () => {
        setPrompt("")
        setBaseBranches({})
        setSubmitted(false)
        invalidateQueue()
    }

    const createMutation = useMutation({
        mutationFn: async (): Promise<string> => {
            const created = await aiChangesApi.create(
                microfrontendId,
                { prompt: prompt.trim(), baseBranch: baseBranches[microfrontendId]?.trim() || undefined, effort, aiModelId },
                {
                    customErrorMessage: error => {
                        const code = errorCodeOf(error)
                        return code && CREATE_ERROR_CODES.has(code) ? t(`microfrontend.aiChange.errors.${code}`) : t("microfrontend.aiChange.errors.create")
                    }
                }
            )
            queryClient.setQueryData(["ai-change", created._id], created)
            return created._id
        },
        onSuccess: reset
    })

    const promptError = submitted && prompt.trim().length === 0 ? t("microfrontend.aiChange.prompt_required") : undefined

    const generate = () => {
        setSubmitted(true)
        if (prompt.trim().length === 0 || prompt.length > PROMPT_MAX_LENGTH) {
            promptRef.current?.focus()
            return
        }
        // Navigation goes in the call options: they are skipped once the page is left, the hook-level callback is not.
        createMutation.mutate(undefined, { onSuccess: select })
    }

    const startNew = () => {
        select(NEW_CHANGE)
        if (promptRef.current) promptRef.current.focus()
        else focusComposer.current = true
    }

    const retry = (retriedPrompt: string, retriedBaseBranches?: BaseBranches) => {
        setPrompt(retriedPrompt)
        setBaseBranches(retriedBaseBranches ?? {})
        startNew()
    }

    const groups: QueueGroup[] = ["review", "active", "discarded", "applied", "failed"]

    return (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <aside aria-label={t("microfrontend.aiChange.queue_label")} className="flex flex-col gap-5 lg:sticky lg:top-4">
                <Button type="button" variant={linkedId === NEW_CHANGE ? "secondary" : "primary"} onClick={startNew} dataTestId="ai-change-new">
                    <Plus aria-hidden="true" />
                    {t("microfrontend.aiChange.new_change")}
                </Button>
                {queueQuery.isPending && <Spinner size={24} centerScreen={false} label={t("common.loading")} />}
                {queueQuery.isError && <p className="text-sm text-destructive">{t("microfrontend.aiChange.errors.history")}</p>}
                {queueQuery.data &&
                    groups.map(group => <QueueSection key={group} group={group} entries={entries.filter(entry => groupOf(entry.status) === group)} selectedId={linkedId ?? ""} onSelect={select} />)}
            </aside>

            <div className="min-w-0">
                {(linkedId === NEW_CHANGE || (!linkedId && queueQuery.data?.length === 0)) && (
                    <Composer
                        name={name}
                        prompt={prompt}
                        repositories={repositories}
                        baseBranches={baseBranches}
                        onPromptChange={setPrompt}
                        onBaseBranchesChange={setBaseBranches}
                        onSubmit={generate}
                        pending={createMutation.isPending}
                        error={promptError}
                        promptRef={promptRef}
                        focusOnMount={focusComposer}
                    />
                )}
                {selectedId && <RequestSelection requestId={selectedId} microfrontendId={microfrontendId} onRetry={retry} onQueueChanged={invalidateQueue} />}
            </div>
        </div>
    )
}

export default AiWorkspace
