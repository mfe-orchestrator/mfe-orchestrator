import { Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label, Spinner, Textarea } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useAiJobsApi from "@/hooks/apiClients/useAiJobsApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useAssistantJobsStore from "@/store/useAssistantJobsStore"
import AiModelSelect from "./AiModelSelect"
import { jobErrorMessage, PROMPT_MAX_LENGTH } from "./AssistantJobThread"
import EffortSelect from "./EffortSelect"
import { useEffort } from "./useEffort"
import useProjectAiModels from "./useProjectAiModels"

/** Mirrors the backend: a job works on at most this many repositories. */
const MAX_REPOSITORIES = 10

interface NewJobFormProps {
    projectId: string
    onCreated: () => void
    onCancel: () => void
}

/** Lives inside the dialog content, so closing the dialog starts the next job from a blank form. */
const NewJobForm: React.FC<NewJobFormProps> = ({ projectId, onCreated, onCancel }) => {
    const { t } = useTranslation()
    const aiJobsApi = useAiJobsApi()
    const microfrontendsApi = useMicrofrontendsApi()
    const [all, setAll] = useState(false)
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [prompt, setPrompt] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const [effort, setEffort] = useEffort("code")
    const { selected: aiModel, setSelected: setAiModel } = useProjectAiModels()
    const promptRef = useRef<HTMLTextAreaElement>(null)
    const idPrefix = useId()

    const microfrontendsQuery = useQuery({
        queryKey: ["microfrontends-by-project-id", projectId],
        queryFn: () => microfrontendsApi.getByProjectId(projectId)
    })
    // The agent works on code: a microfrontend without a linked repository has nothing to offer it.
    const microfrontends = (microfrontendsQuery.data ?? []).filter(microfrontend => microfrontend._id && microfrontend.codeRepository?.enabled)

    const createMutation = useMutation({
        mutationFn: () =>
            aiJobsApi.create(
                all
                    ? { prompt: prompt.trim(), scope: "global", effort, aiModelId: aiModel?.id }
                    : { prompt: prompt.trim(), scope: "selection", microfrontendIds: [...selected], effort, aiModelId: aiModel?.id },
                {
                    customErrorMessage: error => jobErrorMessage(t, error, "create")
                }
            ),
        onSuccess: job => {
            useAssistantJobsStore.getState().openJob(projectId, job, true)
            onCreated()
        }
    })

    const promptError = submitted && !prompt.trim() ? t("assistant.jobs.new.prompt_required") : undefined
    const selectionError = submitted && !all && selected.size === 0 ? t("assistant.jobs.new.selection_required") : undefined

    const toggle = (id: string) =>
        setSelected(current => {
            const next = new Set(current)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })

    const start = () => {
        setSubmitted(true)
        if (!prompt.trim()) {
            promptRef.current?.focus()
            return
        }
        if (!all && selected.size === 0) return
        createMutation.mutate()
    }

    const promptId = `${idPrefix}-prompt`
    const allId = `${idPrefix}-all`

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={event => {
                event.preventDefault()
                start()
            }}
        >
            <fieldset className="flex flex-col gap-2" aria-describedby={`${idPrefix}-selection-hint`}>
                <legend className="mb-2 text-sm font-medium">{t("assistant.jobs.new.repositories_label")}</legend>
                <div className="flex items-center gap-2">
                    <Checkbox id={allId} checked={all} disabled={createMutation.isPending} onCheckedChange={checked => setAll(checked === true)} dataTestId="assistant-new-job-all" />
                    <Label htmlFor={allId} className="cursor-pointer">
                        {t("assistant.jobs.new.all")}
                    </Label>
                </div>
                {microfrontendsQuery.isPending && <Spinner size={20} centerScreen={false} label={t("common.loading")} />}
                {!microfrontendsQuery.isPending && microfrontends.length === 0 && <p className="text-sm text-foreground-secondary">{t("assistant.jobs.new.no_repositories")}</p>}
                {microfrontends.length > 0 && (
                    <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border border-divider p-3">
                        {microfrontends.map(microfrontend => {
                            const id = microfrontend._id as string
                            const checkboxId = `${idPrefix}-mfe-${id}`
                            const checked = all || selected.has(id)
                            return (
                                <li key={id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={checkboxId}
                                        checked={checked}
                                        // "All" covers them; past the limit only unchecking is possible.
                                        disabled={all || createMutation.isPending || (!checked && selected.size >= MAX_REPOSITORIES)}
                                        onCheckedChange={() => toggle(id)}
                                    />
                                    <Label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer truncate">
                                        {microfrontend.name}
                                    </Label>
                                </li>
                            )
                        })}
                    </ul>
                )}
                <p id={`${idPrefix}-selection-hint`} className={`text-xs ${selectionError ? "text-destructive" : "text-foreground-secondary"}`}>
                    {selectionError ?? (all ? t("assistant.jobs.new.all_hint", { max: MAX_REPOSITORIES }) : t("assistant.jobs.new.selection_hint", { selected: selected.size, max: MAX_REPOSITORIES }))}
                </p>
            </fieldset>

            <div className="flex flex-col gap-1.5">
                <Label htmlFor={promptId}>
                    {t("assistant.jobs.new.prompt_label")}
                    <span aria-hidden="true"> *</span>
                </Label>
                <Textarea
                    id={promptId}
                    ref={promptRef}
                    value={prompt}
                    rows={5}
                    maxLength={PROMPT_MAX_LENGTH}
                    aria-required="true"
                    aria-invalid={Boolean(promptError)}
                    aria-describedby={`${promptId}-hint`}
                    placeholder={t("assistant.jobs.new.prompt_placeholder")}
                    disabled={createMutation.isPending}
                    onChange={event => setPrompt(event.target.value)}
                    dataTestId="assistant-new-job-prompt"
                />
                <p id={`${promptId}-hint`} className="text-xs text-destructive">
                    {promptError}
                </p>
            </div>

            <DialogFooter>
                <div className="mr-auto flex items-center gap-2">
                    <AiModelSelect value={aiModel?.id} onChange={setAiModel} disabled={createMutation.isPending} dataTestId="assistant-new-job-ai-model" />
                    <EffortSelect value={effort} onChange={setEffort} disabled={createMutation.isPending} dataTestId="assistant-new-job-effort" />
                </div>
                <Button type="button" variant="secondary" disabled={createMutation.isPending} onClick={onCancel}>
                    {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending} dataTestId="assistant-new-job-start">
                    {createMutation.isPending ? <Spinner size={16} centerScreen={false} /> : <Sparkles aria-hidden="true" />}
                    {t("assistant.jobs.new.start")}
                </Button>
            </DialogFooter>
        </form>
    )
}

interface AssistantNewJobDialogProps {
    projectId: string
    open: boolean
    onOpenChange: (open: boolean) => void
}

/** Starts an agent job on the microfrontends the user picks, or on all of them; the job opens in a tab of its own. */
const AssistantNewJobDialog: React.FC<AssistantNewJobDialogProps> = ({ projectId, open, onOpenChange }) => {
    const { t } = useTranslation()
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent closeLabel={t("common.close")} dataTestId="assistant-new-job-dialog">
                <DialogHeader>
                    <DialogTitle>{t("assistant.jobs.new.title")}</DialogTitle>
                    <DialogDescription>{t("assistant.jobs.new.description")}</DialogDescription>
                </DialogHeader>
                <NewJobForm projectId={projectId} onCreated={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    )
}

export default AssistantNewJobDialog
