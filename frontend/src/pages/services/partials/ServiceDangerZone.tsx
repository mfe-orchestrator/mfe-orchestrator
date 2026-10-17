import { ConfirmByTypingDialog, DangerZoneCard } from "@mfe-orchestrator/design-system"
import { useMutation } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import useServicesApi, { Service } from "@/hooks/apiClients/useServicesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

export const ServiceDangerZone: React.FC<{ service: Service }> = ({ service }) => {
    const [opened, setOpened] = useState(false)
    const { deleteSingle } = useServicesApi()
    const notifications = useToastNotificationStore()
    const navigate = useNavigate()
    const { t } = useTranslation()

    const deleteMutation = useMutation({
        mutationFn: () => deleteSingle(service._id!),
        onSuccess: () => {
            notifications.showSuccessNotification({ message: t("services.dangerZone.success") })
            navigate("/services")
        }
    })

    return (
        <DangerZoneCard
            title={t("services.dangerZone.title")}
            description={t("services.dangerZone.subtitle")}
            actionTitle={t("services.dangerZone.action_title")}
            actionDescription={t("services.dangerZone.action_description")}
            actionLabel={t("services.dangerZone.button")}
            actionIcon={<Trash2 />}
            onAction={() => setOpened(true)}
        >
            <ConfirmByTypingDialog
                open={opened}
                onOpenChange={setOpened}
                expectedText={service.name}
                onConfirm={async () => {
                    await deleteMutation.mutateAsync()
                }}
                isPending={deleteMutation.isPending}
                title={t("services.dangerZone.dialog.title")}
                warningTitle={t("services.dangerZone.dialog.warning")}
                warningDescription={t("services.dangerZone.dialog.description", { name: service.name })}
                confirmationHint={t("services.dangerZone.dialog.confirmation", { name: service.name })}
                placeholder={service.name}
                confirmLabel={t("services.dangerZone.dialog.confirm")}
                confirmingLabel={t("common.deleting")}
                cancelLabel={t("common.cancel")}
                closeLabel={t("common.close")}
            />
        </DangerZoneCard>
    )
}

export default ServiceDangerZone
