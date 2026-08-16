import { ConfirmByTypingDialog, DangerZoneCard } from "@mfe-orchestrator/design-system"
import { useMutation } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface IDangerZoneRemoveMicrofrontendProps {
    microfrontend?: Microfrontend
}

export const DangerZoneRemoveMicrofrontend: React.FC<IDangerZoneRemoveMicrofrontendProps> = ({ microfrontend }) => {
    const [opened, setOpened] = useState(false)
    const { deleteSingle } = useMicrofrontendsApi()
    const notificationToast = useToastNotificationStore()
    const navigate = useNavigate()
    const { t } = useTranslation()

    const deleteMicrofrontendMutation = useMutation({
        mutationFn: () => deleteSingle(microfrontend!._id),
        onSuccess: () => {
            notificationToast.showSuccessNotification({
                message: t("microfrontend.dangerZone.delete.success")
            })
            navigate("/microfrontends")
        }
    })

    // Don't render if there's no microfrontend (creating new one)
    if (!microfrontend) {
        return null
    }

    return (
        <DangerZoneCard
            title={t("microfrontend.dangerZone.title")}
            description={t("microfrontend.dangerZone.subtitle")}
            actionTitle={t("microfrontend.dangerZone.delete.title")}
            actionDescription={t("microfrontend.dangerZone.delete.description")}
            actionLabel={t("microfrontend.dangerZone.delete.button")}
            actionIcon={<Trash2 />}
            onAction={() => setOpened(true)}
        >
            <ConfirmByTypingDialog
                open={opened}
                onOpenChange={setOpened}
                expectedText={microfrontend.name}
                onConfirm={() => deleteMicrofrontendMutation.mutateAsync()}
                isPending={deleteMicrofrontendMutation.isPending}
                title={t("microfrontend.dangerZone.delete.dialog.title")}
                warningTitle={t("microfrontend.dangerZone.delete.dialog.warning")}
                warningDescription={
                    <>
                        {t("microfrontend.dangerZone.delete.dialog.description", { microfrontendName: microfrontend.name })}
                        <div className="mt-2">{t("microfrontend.dangerZone.delete.dialog.confirmation", { microfrontendName: microfrontend.name })}</div>
                    </>
                }
                confirmationHint={t("microfrontend.dangerZone.delete.dialog.confirmationText", { microfrontendName: microfrontend.name })}
                placeholder={microfrontend.name}
                confirmLabel={t("microfrontend.dangerZone.delete.dialog.confirmButton")}
                confirmingLabel={t("microfrontend.dangerZone.delete.dialog.deleting")}
                cancelLabel={t("common.cancel")}
                closeLabel={t("common.close")}
            />
        </DangerZoneCard>
    )
}

export default DangerZoneRemoveMicrofrontend
