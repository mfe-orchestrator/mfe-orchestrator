import {
    Alert,
    AlertDescription,
    Card,
    Checkbox,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    EmptyState,
    Label,
    RadioGroup,
    RadioGroupItem,
    SectionHeader,
    Spinner,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderKey, Pencil } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import useAiModelsApi, { AiModelSummary, AVAILABLE_AI_MODELS_QUERY_KEY, aiModelLabel, PROJECT_AI_ACCESS_QUERY_KEY, ProjectAiAccess } from "@/hooks/apiClients/useAiModelsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface ProjectAiAccessDialogProps {
    access: ProjectAiAccess
    models: AiModelSummary[]
    onClose: () => void
}

/** Every AI of the organization, those added later too, or a chosen few: none at all turns the AI features off in the project. */
const ProjectAiAccessDialog: React.FC<ProjectAiAccessDialogProps> = ({ access, models, onClose }) => {
    const { t } = useTranslation()
    const aiModelsApi = useAiModelsApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const idPrefix = useId()
    const [mode, setMode] = useState<"all" | "selected">(access.aiModelIds === null ? "all" : "selected")
    const [selected, setSelected] = useState<Set<string>>(() => new Set(access.aiModelIds ?? []))

    const saveMutation = useMutation({
        // Only ids still among the AIs of the organization: one removed meanwhile would be refused.
        mutationFn: () => aiModelsApi.setProjectAccess(access.projectId, mode === "all" ? null : models.filter(model => selected.has(model.id)).map(model => model.id)),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [PROJECT_AI_ACCESS_QUERY_KEY] })
            queryClient.invalidateQueries({ queryKey: [AVAILABLE_AI_MODELS_QUERY_KEY] })
            notifications.showSuccessNotification({ message: t("ai_models.access.saved", { project: access.name }) })
            onClose()
        }
    })

    const toggle = (aiModelId: string) =>
        setSelected(current => {
            const next = new Set(current)
            if (next.has(aiModelId)) next.delete(aiModelId)
            else next.add(aiModelId)
            return next
        })

    const noneSelected = mode === "selected" && !models.some(model => selected.has(model.id))

    return (
        <Dialog open onOpenChange={open => !open && onClose()}>
            <DialogContent className="sm:max-w-[480px]">
                <form
                    onSubmit={event => {
                        event.preventDefault()
                        saveMutation.mutate()
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t("ai_models.access.dialog_title", { project: access.name })}</DialogTitle>
                        <DialogDescription>{t("ai_models.access.dialog_description")}</DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-4">
                        <RadioGroup value={mode} onValueChange={value => setMode(value as "all" | "selected")} aria-label={t("ai_models.access.mode_label")} dataTestId="ai-access-mode">
                            <div className="flex items-start gap-2">
                                <RadioGroupItem id={`${idPrefix}-all`} value="all" className="mt-0.5" />
                                <Label htmlFor={`${idPrefix}-all`} className="flex cursor-pointer flex-col gap-0.5">
                                    <span>{t("ai_models.access.all")}</span>
                                    <span className="text-xs font-normal text-foreground-secondary">{t("ai_models.access.all_hint")}</span>
                                </Label>
                            </div>
                            <div className="flex items-start gap-2">
                                <RadioGroupItem id={`${idPrefix}-selected`} value="selected" className="mt-0.5" />
                                <Label htmlFor={`${idPrefix}-selected`} className="flex cursor-pointer flex-col gap-0.5">
                                    <span>{t("ai_models.access.selected")}</span>
                                    <span className="text-xs font-normal text-foreground-secondary">{t("ai_models.access.selected_hint")}</span>
                                </Label>
                            </div>
                        </RadioGroup>
                        {mode === "selected" && (
                            <fieldset className="flex flex-col gap-2 rounded-md border border-divider p-3">
                                <legend className="sr-only">{t("ai_models.access.models_label")}</legend>
                                {models.map(model => {
                                    const checkboxId = `${idPrefix}-${model.id}`
                                    return (
                                        <div key={model.id} className="flex items-center gap-2">
                                            <Checkbox id={checkboxId} checked={selected.has(model.id)} onCheckedChange={() => toggle(model.id)} dataTestId={`ai-access-model-${model.id}`} />
                                            <Label htmlFor={checkboxId} className="cursor-pointer">
                                                {aiModelLabel(t, model)}
                                            </Label>
                                        </div>
                                    )
                                })}
                            </fieldset>
                        )}
                        {noneSelected && (
                            <Alert variant="destructive" dataTestId="ai-access-none">
                                <AlertDescription>{t("ai_models.access.none_warning")}</AlertDescription>
                            </Alert>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="secondary" onClick={onClose} disabled={saveMutation.isPending}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit" loading={saveMutation.isPending} loadingLabel={t("common.loading")} dataTestId="ai-access-save">
                            {t("common.save")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

interface ProjectAiAccessSectionProps {
    organizationId: string
    models: AiModelSummary[]
}

/** Which AIs each project of the organization can use: by default all of them. For its owners and administrators. */
export const ProjectAiAccessSection: React.FC<ProjectAiAccessSectionProps> = ({ organizationId, models }) => {
    const { t } = useTranslation()
    const aiModelsApi = useAiModelsApi()
    const [editing, setEditing] = useState<ProjectAiAccess>()

    const accessQuery = useQuery({
        queryKey: [PROJECT_AI_ACCESS_QUERY_KEY, organizationId],
        queryFn: () => aiModelsApi.projectAccess(organizationId)
    })
    const projects = accessQuery.data ?? []

    const accessOf = (project: ProjectAiAccess) => {
        if (project.aiModelIds === null) return <span className="text-muted-foreground">{t("ai_models.access.all_default")}</span>
        const chosen = models.filter(model => project.aiModelIds?.includes(model.id))
        if (chosen.length === 0) return <Badge variant="destructive">{t("ai_models.access.disabled")}</Badge>
        return (
            <div className="flex flex-wrap gap-1">
                {chosen.map(model => (
                    <Badge key={model.id} variant="outline">
                        {aiModelLabel(t, model)}
                    </Badge>
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-4" data-testid="organization-ai-access">
            <SectionHeader as="h3" icon={<FolderKey />} title={t("ai_models.access.title")} description={t("ai_models.access.subtitle")} />
            <Card>
                {accessQuery.isPending ? (
                    <div className="flex min-h-[120px] items-center justify-center">
                        <Spinner size={24} centerScreen={false} label={t("common.loading")} />
                    </div>
                ) : accessQuery.isError ? (
                    <EmptyState size="sm" description={t("ai_models.errors.load_access")} />
                ) : projects.length === 0 ? (
                    <EmptyState size="sm" description={t("ai_models.access.no_projects")} />
                ) : (
                    <Table>
                        <TableHeader tinted={false}>
                            <TableRow>
                                <TableHead>{t("ai_models.access.project")}</TableHead>
                                <TableHead>{t("ai_models.access.models")}</TableHead>
                                <TableHead className="w-[100px] text-center">{t("common.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {projects.map(project => (
                                <TableRow key={project.projectId} data-testid={`ai-access-project-${project.projectId}`}>
                                    <TableCell className="font-medium">{project.name}</TableCell>
                                    <TableCell>{accessOf(project)}</TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            title={t("common.edit")}
                                            aria-label={t("ai_models.access.edit", { project: project.name })}
                                            onClick={() => setEditing(project)}
                                            dataTestId={`ai-access-edit-${project.projectId}`}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>
            {editing && <ProjectAiAccessDialog access={editing} models={models} onClose={() => setEditing(undefined)} />}
        </div>
    )
}

export default ProjectAiAccessSection
