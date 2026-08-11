import { DeleteConfirmationDialog as DesignSystemDeleteConfirmationDialog } from "@mfe-orchestrator/design-system"
import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

type DeleteConfirmationDialogProps = ComponentProps<typeof DesignSystemDeleteConfirmationDialog>

/** Dialog di conferma del design system con le etichette dei pulsanti tradotte. */
export function DeleteConfirmationDialog(props: DeleteConfirmationDialogProps) {
    const { t } = useTranslation()

    return <DesignSystemDeleteConfirmationDialog cancelLabel={t("common.cancel")} deleteLabel={t("common.delete")} deletingLabel={t("common.deleting")} {...props} />
}
