import { Card, EmptyState, SectionHeader, Spinner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Cpu, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useAiModelsApi, {
    AiModelDetail,
    AiModelSummary,
    AVAILABLE_AI_MODELS_QUERY_KEY,
    aiModelLabel,
    isAiModelDetail,
    ORGANIZATION_AI_MODELS_QUERY_KEY,
    PROJECT_AI_ACCESS_QUERY_KEY
} from "@/hooks/apiClients/useAiModelsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import AiModelFormDialog from "./AiModelFormDialog"
import ProjectAiAccessSection from "./ProjectAiAccessSection"

interface OrganizationAiModelsSectionProps {
    organizationId: string
    canAdminister: boolean
}

/**
 * The AIs of the organization, which its projects use for every AI feature: every member sees them, owners and
 * administrators add, edit and remove them and decide which projects use which. The system AI, built from the
 * installation's environment, is listed with them but only its use by the projects can be changed.
 */
export const OrganizationAiModelsSection: React.FC<OrganizationAiModelsSectionProps> = ({ organizationId, canAdminister }) => {
    const { t } = useTranslation()
    const aiModelsApi = useAiModelsApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const [form, setForm] = useState<{ open: boolean; aiModel?: AiModelDetail }>({ open: false })
    const [toDelete, setToDelete] = useState<AiModelSummary>()

    const modelsQuery = useQuery({
        queryKey: [ORGANIZATION_AI_MODELS_QUERY_KEY, organizationId],
        queryFn: () => aiModelsApi.list(organizationId)
    })
    const models = modelsQuery.data ?? []

    const deleteMutation = useMutation({
        mutationFn: (aiModelId: string) => aiModelsApi.remove(organizationId, aiModelId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [ORGANIZATION_AI_MODELS_QUERY_KEY, organizationId] })
            queryClient.invalidateQueries({ queryKey: [PROJECT_AI_ACCESS_QUERY_KEY, organizationId] })
            queryClient.invalidateQueries({ queryKey: [AVAILABLE_AI_MODELS_QUERY_KEY] })
            notifications.showSuccessNotification({ message: t("ai_models.deleted") })
        }
    })

    return (
        <div className="space-y-4" data-testid="organization-ai-models">
            <SectionHeader
                icon={<Cpu />}
                title={t("ai_models.title")}
                description={t("ai_models.subtitle")}
                actions={
                    canAdminister ? (
                        <Button size="sm" onClick={() => setForm({ open: true })} dataTestId="ai-model-add">
                            <Plus />
                            {t("ai_models.add")}
                        </Button>
                    ) : undefined
                }
            />
            <Card>
                {modelsQuery.isPending ? (
                    <div className="flex min-h-[120px] items-center justify-center">
                        <Spinner size={24} centerScreen={false} label={t("common.loading")} />
                    </div>
                ) : modelsQuery.isError ? (
                    <EmptyState size="sm" description={t("ai_models.errors.load")} />
                ) : models.length === 0 ? (
                    <EmptyState size="sm" description={t(canAdminister ? "ai_models.empty_admin" : "ai_models.empty")} />
                ) : (
                    <Table>
                        <TableHeader tinted={false}>
                            <TableRow>
                                <TableHead>{t("ai_models.columns.name")}</TableHead>
                                <TableHead>{t("ai_models.columns.provider")}</TableHead>
                                <TableHead>{t("ai_models.columns.model")}</TableHead>
                                {canAdminister && <TableHead className="w-[100px] text-center">{t("common.actions")}</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {models.map(model => (
                                <TableRow key={model.id} data-testid={`ai-model-${model.id}`}>
                                    <TableCell>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium">{aiModelLabel(t, model)}</span>
                                            {model.isDefault && <Badge variant="accent">{t("ai_models.badges.default")}</Badge>}
                                            {model.system && (
                                                <Badge variant="outline" title={t("ai_models.system_hint")}>
                                                    {t("ai_models.badges.system")}
                                                </Badge>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{t(`ai_models.providers.${model.provider}`)}</TableCell>
                                    <TableCell className="font-mono text-sm text-muted-foreground">{model.model}</TableCell>
                                    {canAdminister && (
                                        <TableCell className="text-center">
                                            {/* The system AI comes from the installation's environment: nothing of it can change here. */}
                                            {!model.system && isAiModelDetail(model) && (
                                                <div className="flex items-center justify-center gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        title={t("common.edit")}
                                                        aria-label={t("ai_models.edit", { name: model.name })}
                                                        onClick={() => setForm({ open: true, aiModel: model })}
                                                        dataTestId={`ai-model-edit-${model.id}`}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        title={t("common.delete")}
                                                        aria-label={t("ai_models.delete", { name: model.name })}
                                                        disabled={deleteMutation.isPending}
                                                        onClick={() => setToDelete(model)}
                                                        dataTestId={`ai-model-delete-${model.id}`}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </Card>

            {canAdminister && models.length > 0 && <ProjectAiAccessSection organizationId={organizationId} models={models} />}

            {canAdminister && <AiModelFormDialog open={form.open} onOpenChange={open => setForm(current => ({ ...current, open }))} organizationId={organizationId} aiModel={form.aiModel} />}

            <DeleteConfirmationDialog
                isOpen={Boolean(toDelete)}
                onOpenChange={open => !open && setToDelete(undefined)}
                onDelete={async () => {
                    if (toDelete) {
                        deleteMutation.mutate(toDelete.id)
                        setToDelete(undefined)
                    }
                }}
                title={t("ai_models.confirm_delete_title")}
                description={t("ai_models.confirm_delete", { name: toDelete?.name ?? "" })}
            />
        </div>
    )
}

export default OrganizationAiModelsSection
