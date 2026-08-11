import { TextField as DesignSystemTextField } from "@mfe-orchestrator/design-system"
import type { FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"

type TextFieldProps<T extends FieldValues> = Parameters<typeof DesignSystemTextField<T>>[0]

/**
 * TextField del design system con le etichette del toggle di visibilita
 * tradotte: con `type="password"` il campo mostra l'icona occhio.
 */
const TextField = <T extends FieldValues>(props: TextFieldProps<T>) => {
    const { t } = useTranslation()

    return <DesignSystemTextField<T> showValueLabel={t("auth.show_password")} hideValueLabel={t("auth.hide_password")} {...props} />
}

export default TextField
