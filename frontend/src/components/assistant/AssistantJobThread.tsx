import { Alert, AlertDescription, AlertTitle, Spinner, Textarea } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { TFunction } from "i18next"
import { AlertTriangle, ArrowUp, ExternalLink, GitBranch } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { ProgressLog, StatusBadge } from "@/components/ai-workspace/AiChangeProgress"
import { Badge, Button } from "@/components/atoms"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useAiJobsApi, { AiJob, AiJobRepository, AiUsage, isAiJobActive } from "@/hooks/apiClients/useAiJobsApi"
import { effortsOf } from "@/hooks/apiClients/useAiModelsApi"
import { errorCodeOf } from "@/hooks/useApiClient"
import useAssistantJobsStore, { AssistantJobTab } from "@/store/useAssistantJobsStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import AiModelSelect from "./AiModelSelect"
import AnswerUsage from "./AnswerUsage"
import AssistantMessageText from "./AssistantMessageText"
import EffortSelect from "./EffortSelect"
import { useFollowUpAiModel, useFollowUpEffort } from "./useEffort"

export const POLL_INTERVAL_MS = 2000
export const PROMPT_MAX_LENGTH = 8000

/** Error codes of the job endpoints that have a message of their own. */
const JOB_ERROR_CODES = new Set([
    "ASSISTANT_DISABLED",
    "AI_CHANGE_FORBIDDEN",
    "AI_CHANGE_NOT_PROPOSED",
    "AI_CHANGE_TOO_MANY",
    "AI_JOB_FOLLOW_UP_RUNNING",
    "AI_JOB_NOT_DONE",
    "AI_JOB_NO_REPOSITORIES",
    "AI_JOB_TOO_MANY_REPOSITORIES",
    "AI_MODEL_NOT_AVAILABLE",
    "AI_PROVIDER_ERROR"
])

/** The translated message of a failed job call; `fallback` is a key under `assistant.jobs.errors`. */
export const jobErrorMessage = (t: TFunction, error: Error, fallback: string) => {
    const code = errorCodeOf(error)
    // The provider's rate limit: said as the chat says it.
    if (code === "RATE_LIMITED") return t("assistant.errors.rate_limited")
    return t(`assistant.jobs.errors.${code && JOB_ERROR_CODES.has(code) ? code : fallback}`)
}

export const sumUsage = (jobs: AiJob[]): AiUsage =>
    jobs.reduce(
        (total, job) => ({
            inputTokens: total.inputTokens + job.usage.inputTokens,
            cachedInputTokens: total.cachedInputTokens + job.usage.cachedInputTokens,
            outputTokens: total.outputTokens + job.usage.outputTokens
        }),
        { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }
    )

/** Still moving: the agent works, or a proposal is being pushed. */
const isBusy = (job: AiJob) => isAiJobActive(job.status) || job.repositories.some(repository => repository.status === "APPLYING")

/** An apply started from the tab: its outcome is told once, when polling sees the last of its repositories settle. */
interface PendingApply {
    jobId: string
    requestIds: string[]
}

const RepositoryCard: React.FC<{ repository: AiJobRepository }> = ({ repository }) => {
    const { t } = useTranslation()
    return (
        <li className="flex flex-col gap-1 rounded-md border border-divider px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{repository.microfrontendName}</span>
                <StatusBadge status={repository.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-secondary">
                <span>{t("assistant.jobs.files", { count: repository.files.length })}</span>
                {/* The review happens on the microfrontend page: diff, file selection, apply and discard. */}
                <Link
                    to={`/microfrontend/${repository.microfrontendId}?change=${repository.requestId}`}
                    aria-label={t("assistant.jobs.diff_label", { name: repository.microfrontendName })}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                >
                    {t("assistant.jobs.diff")}
                </Link>
                {repository.pullRequestUrl && (
                    <a
                        href={repository.pullRequestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                    >
                        {t("microfrontend.aiChange.pull_request")}
                        <ExternalLink className="size-3" aria-hidden="true" />
                        <span className="sr-only">{t("microfrontend.aiChange.opens_new_tab")}</span>
                    </a>
                )}
            </div>
            {repository.error && <p className="whitespace-pre-wrap break-words text-xs text-destructive">{repository.error}</p>}
            {repository.pullRequestError && <p className="whitespace-pre-wrap break-words text-xs text-foreground-secondary">{repository.pullRequestError}</p>}
        </li>
    )
}

/** One job of the chain: the request as the user's bubble, then what the agent did. */
const JobEntry: React.FC<{ job: AiJob }> = ({ job }) => {
    const { t } = useTranslation()
    const active = isAiJobActive(job.status)

    return (
        <div className="flex flex-col gap-2 text-sm text-foreground">
            <div className="max-w-[85%] self-end rounded-lg bg-primary/10 px-3 py-2">
                <AssistantMessageText text={job.prompt} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant={job.status === "FAILED" ? "destructive" : job.status === "DONE" ? "accent" : "outline"}>{t(`assistant.jobs.status.${job.status}`)}</Badge>
                {job.scope === "global" && <Badge variant="outline">{t("assistant.jobs.scope_global")}</Badge>}
            </div>
            {active ? (
                <ProgressLog events={job.events ?? []} live />
            ) : (
                Boolean(job.events?.length) && (
                    <details className="text-xs">
                        <summary className="cursor-pointer text-foreground-secondary">{t("microfrontend.aiChange.show_progress_log")}</summary>
                        <div className="mt-2">
                            <ProgressLog events={job.events ?? []} live={false} />
                        </div>
                    </details>
                )
            )}
            {job.status === "FAILED" && (
                <Alert variant="destructive">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    <AlertTitle>{t("assistant.jobs.failed_title")}</AlertTitle>
                    <AlertDescription className="whitespace-pre-wrap break-words">{job.error || t("microfrontend.aiChange.errors.generic")}</AlertDescription>
                </Alert>
            )}
            {job.summary && !active && <AssistantMessageText text={job.summary} />}
            <ul className="flex flex-col gap-2" aria-label={t("assistant.jobs.repositories")}>
                {job.repositories.map(repository => (
                    <RepositoryCard key={repository.requestId} repository={repository} />
                ))}
            </ul>
            {!active && <AnswerUsage usage={job.usage} label={t("assistant.jobs.usage_job")} hint={t("assistant.jobs.usage_hint")} effort={job.effort} />}
        </div>
    )
}

interface ApplyAllButtonProps {
    job: AiJob
    /** The requests with a proposal to push. */
    requestIds: string[]
    /** The backend accepted the apply (202) and pushes in the background: `applied` already shows the repositories applying. */
    onApplying: (applied: AiJob, requestIds: string[]) => void
}

/** Pushes every proposal of the job, one pull request per repository: it publishes code, so it asks first. */
const ApplyAllButton: React.FC<ApplyAllButtonProps> = ({ job, requestIds, onApplying }) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const [confirming, setConfirming] = useState(false)

    const applyMutation = useMutation({
        mutationFn: () => aiJobsApi.apply(job._id, { customErrorMessage: error => jobErrorMessage(t, error, "apply") }),
        onSuccess: applied => onApplying(applied, requestIds)
    })

    return (
        <>
            <Button type="button" size="sm" disabled={applyMutation.isPending} onClick={() => setConfirming(true)} dataTestId="assistant-job-apply-all">
                {applyMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <GitBranch aria-hidden="true" />}
                {t("assistant.jobs.apply_all", { count: requestIds.length })}
            </Button>
            <DeleteConfirmationDialog
                isOpen={confirming}
                onOpenChange={setConfirming}
                title={t("assistant.jobs.apply_all_title")}
                description={t("assistant.jobs.apply_all_description", { count: requestIds.length })}
                deleteLabel={t("assistant.jobs.apply_all_confirm")}
                deletingLabel={t("assistant.jobs.apply_all_applying")}
                // The API client already shows the error: the dialog closes either way.
                onDelete={() =>
                    applyMutation.mutateAsync().then(
                        () => undefined,
                        () => undefined
                    )
                }
            />
        </>
    )
}

interface FollowUpFormProps {
    projectId: string
    latest: AiJob
    /** The job the follow-up refines: the latest one that finished with proposals still open. */
    target?: AiJob
}

/** Asks the agent to go on from the latest proposal: a child job, which the tab follows from then on. */
const FollowUpForm: React.FC<FollowUpFormProps> = ({ projectId, latest, target }) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const [draft, setDraft] = useState("")
    // While nothing is open to refine, the latest job's: what the running follow-up was sent with.
    const [aiModel, setAiModel] = useFollowUpAiModel(target ?? latest)
    const [effort, setEffort] = useFollowUpEffort(target ?? latest, aiModel)

    const followUpMutation = useMutation({
        mutationFn: ({ jobId, prompt }: { jobId: string; prompt: string }) =>
            aiJobsApi.followUp(jobId, { prompt, effort, aiModelId: aiModel?.id }, { customErrorMessage: error => jobErrorMessage(t, error, "follow_up") }),
        onSuccess: child => {
            useAssistantJobsStore.getState().openJob(projectId, child, true)
            setDraft("")
        }
    })

    // The backend only refines a finished job with a proposal still open, and one follow-up at a time.
    const ready = Boolean(target)
    const placeholder = isAiJobActive(latest.status)
        ? "assistant.jobs.follow_up_running"
        : target
          ? "assistant.jobs.follow_up_placeholder"
          : latest.status === "FAILED"
            ? "assistant.jobs.follow_up_failed"
            : "assistant.jobs.follow_up_no_proposal"

    const submit = () => {
        if (!draft.trim() || !target || followUpMutation.isPending) return
        followUpMutation.mutate({ jobId: target._id, prompt: draft.trim() })
    }

    return (
        <form
            className="flex flex-col gap-2 border-t border-divider px-4 py-3"
            onSubmit={event => {
                event.preventDefault()
                submit()
            }}
        >
            <div className="flex items-end gap-2">
                <Textarea
                    value={draft}
                    maxLength={PROMPT_MAX_LENGTH}
                    rows={2}
                    className="min-h-[44px] resize-none"
                    disabled={!ready || followUpMutation.isPending}
                    placeholder={t(placeholder)}
                    aria-label={t("assistant.jobs.follow_up_placeholder")}
                    dataTestId="assistant-job-follow-up"
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault()
                            submit()
                        }
                    }}
                />
                <Button
                    type="submit"
                    size="icon"
                    aria-label={t("assistant.jobs.follow_up_send")}
                    disabled={!draft.trim() || !ready || followUpMutation.isPending}
                    dataTestId="assistant-job-follow-up-send"
                >
                    {followUpMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <ArrowUp />}
                </Button>
            </div>
            {/* Below the field, not next to it: the panel is too narrow for both. */}
            <div className="flex items-center justify-end gap-2">
                <AiModelSelect value={aiModel?.id} onChange={setAiModel} disabled={!ready || followUpMutation.isPending} dataTestId="assistant-job-follow-up-ai-model" />
                <EffortSelect value={effort} onChange={setEffort} efforts={effortsOf(aiModel)} disabled={!ready || followUpMutation.isPending} dataTestId="assistant-job-follow-up-effort" />
            </div>
        </form>
    )
}

interface AssistantJobThreadProps {
    projectId: string
    tab: AssistantJobTab
}

/** The tab of a chain of jobs: each request with the agent's log and its proposals, the cost, and the follow-up input. */
const AssistantJobThread: React.FC<AssistantJobThreadProps> = ({ projectId, tab }) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const scrollRef = useRef<HTMLDivElement>(null)
    const pendingApplyRef = useRef<PendingApply | undefined>(undefined)
    const chainQueryKey = ["ai-job-chain", tab.jobId]

    const chainQuery = useQuery({
        queryKey: chainQueryKey,
        queryFn: async () => {
            const chain = await aiJobsApi.chain(tab.jobId, { silent: true })
            const latest = chain[chain.length - 1]
            const store = useAssistantJobsStore.getState()
            // A follow-up started elsewhere (the chat) makes the chain longer: the tab moves on to it.
            if (latest && latest._id !== tab.jobId) store.openJob(projectId, latest)
            else if (latest) store.syncJob(projectId, latest)
            return chain
        },
        // Any job of the chain: the proposals applied may be those of a parent.
        refetchInterval: query => (query.state.data?.some(isBusy) ? POLL_INTERVAL_MS : false)
    })

    const onApplying = async (applied: AiJob, requestIds: string[]) => {
        notifications.showInfoNotification({ message: t("assistant.jobs.apply_all_started") })
        // A poll that left before the apply would bring back the proposals as they were, and end the wait too early.
        await queryClient.cancelQueries({ queryKey: chainQueryKey })
        pendingApplyRef.current = { jobId: applied._id, requestIds }
        queryClient.setQueryData<AiJob[]>(chainQueryKey, chain => chain?.map(job => (job._id === applied._id ? { ...applied, events: applied.events ?? job.events } : job)))
    }

    // biome-ignore lint/correctness/useExhaustiveDependencies: new data is what may end the apply; the toast store and t are stable enough for this.
    useEffect(() => {
        const pending = pendingApplyRef.current
        if (!pending || !chainQuery.data) return
        const repositories = chainQuery.data.find(job => job._id === pending.jobId)?.repositories.filter(repository => pending.requestIds.includes(repository.requestId)) ?? []
        if (repositories.some(repository => repository.status === "APPLYING")) return
        pendingApplyRef.current = undefined
        // A repository that could not be applied goes back to PROPOSED, with the error on it.
        const failed = repositories.filter(repository => repository.status !== "APPLIED").length
        if (failed === 0) notifications.showSuccessNotification({ message: t("assistant.jobs.apply_all_success") })
        else notifications.showWarningNotification({ message: t("assistant.jobs.apply_all_failed", { count: failed, total: pending.requestIds.length }) })
        // The microfrontend pages show the same requests.
        queryClient.invalidateQueries({ queryKey: ["ai-changes"] })
        queryClient.invalidateQueries({ queryKey: ["ai-change"] })
    }, [chainQuery.data])

    const chain = chainQuery.data ?? []
    const latest = chain[chain.length - 1]
    const eventCount = chain.reduce((count, job) => count + (job.events?.length ?? 0), 0)

    // Newest last, as in the chat: keep the latest step in view while the agent works.
    // biome-ignore lint/correctness/useExhaustiveDependencies: a new job or a new event is what must trigger the scroll
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }, [chain.length, eventCount])

    if (chainQuery.isPending) {
        return (
            <div className="flex flex-1 justify-center py-6">
                <Spinner size={24} centerScreen={false} label={t("common.loading")} />
            </div>
        )
    }

    if (!latest) return <p className="px-4 py-4 text-sm text-destructive">{t("assistant.jobs.errors.load")}</p>

    // A failed follow-up leaves its parent's proposals applicable: act on the latest job that still has some,
    // and on none while a job of the chain runs (the backend refuses both then).
    const target = isAiJobActive(latest.status) ? undefined : [...chain].reverse().find(job => job.status === "DONE" && job.repositories.some(repository => repository.status === "PROPOSED"))
    const proposed = target?.repositories.filter(repository => repository.status === "PROPOSED" && repository.files.length > 0) ?? []

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-1 border-b border-divider px-4 py-2" data-testid="assistant-job-header">
                <AnswerUsage usage={latest.usage} label={t("assistant.jobs.usage_latest")} hint={t("assistant.jobs.usage_hint")} effort={latest.effort} />
                {chain.length > 1 && <AnswerUsage usage={sumUsage(chain)} label={t("assistant.jobs.usage_total", { count: chain.length })} hint={t("assistant.jobs.usage_hint")} />}
                {chainQuery.isError && <p className="text-xs text-destructive">{t("assistant.jobs.errors.load")}</p>}
                {target && proposed.length > 0 && (
                    <div className="flex justify-end pt-1">
                        <ApplyAllButton job={target} requestIds={proposed.map(repository => repository.requestId)} onApplying={onApplying} />
                    </div>
                )}
            </div>

            <div ref={scrollRef} className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
                {chain.map(job => (
                    <JobEntry key={job._id} job={job} />
                ))}
            </div>

            <FollowUpForm projectId={projectId} latest={latest} target={target} />
        </div>
    )
}

export default AssistantJobThread
