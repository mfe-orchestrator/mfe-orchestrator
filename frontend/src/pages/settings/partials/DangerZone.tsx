import { ConfirmByTypingDialog, DangerZoneCard } from "@mfe-orchestrator/design-system"
import { useMutation } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import useProjectApi from "@/hooks/apiClients/useProjectApi"

interface DangerZoneProps {
    projectName: string
    projectId: string
    onDeleteSuccess: () => Promise<void>
}

export function DangerZone({ projectName, projectId, onDeleteSuccess }: DangerZoneProps) {
    const { t } = useTranslation()
    const [opened, setOpened] = useState(false)
    const projectApi = useProjectApi()

    const deleteProjectMutation = useMutation({
        mutationFn: projectApi.deleteProject
    })

    // Il dialog si chiude da solo dopo un onConfirm andato a buon fine, e resta
    // aperto se la mutation solleva: qui basta l'eliminazione vera e propria.
    const handleDeleteProject = async () => {
        await deleteProjectMutation.mutateAsync(projectId)
        await onDeleteSuccess?.()
    }

    return (
        <DangerZoneCard
            title={t("settings.dangerZone.title")}
            description={t("settings.dangerZone.subtitle")}
            actionTitle={t("settings.dangerZone.delete.title")}
            actionDescription={t("settings.dangerZone.delete.description")}
            actionLabel={t("settings.dangerZone.delete.button")}
            actionIcon={<Trash2 />}
            onAction={() => setOpened(true)}
        >
            <ConfirmByTypingDialog
                open={opened}
                onOpenChange={setOpened}
                expectedText={projectName}
                onConfirm={handleDeleteProject}
                isPending={deleteProjectMutation.isPending}
                title={t("settings.dangerZone.delete.dialog.title")}
                warningTitle={t("settings.dangerZone.delete.dialog.warning")}
                warningDescription={
                    <>
                        {t("settings.dangerZone.delete.dialog.description", { projectName })}
                        <div className="mt-2">{t("settings.dangerZone.delete.dialog.confirmation", { projectName })}</div>
                    </>
                }
                confirmationHint={t("settings.dangerZone.delete.dialog.confirmationText", { projectName })}
                confirmLabel={t("settings.dangerZone.delete.dialog.confirmButton")}
                confirmingLabel={t("settings.dangerZone.delete.dialog.deleting")}
                cancelLabel={t("common.cancel")}
                closeLabel={t("common.close")}
            />
        </DangerZoneCard>
    )
}

export default DangerZone
