import { TextareaField as DesignSystemTextareaField } from "@mfe-orchestrator/design-system"
import type { FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"

type TextareaFieldProps<T extends FieldValues> = Parameters<typeof DesignSystemTextareaField<T>>[0]

/**
 * TextareaField del design system con le etichette del toggle di visibilita
 * tradotte: con `secret` il contenuto e mascherato e compare l'icona occhio.
 */
const TextareaField = <T extends FieldValues>(props: TextareaFieldProps<T>) => {
    const { t } = useTranslation()

    return <DesignSystemTextareaField<T> showValueLabel={t("auth.show_password")} hideValueLabel={t("auth.hide_password")} {...props} />
}

export default TextareaField
