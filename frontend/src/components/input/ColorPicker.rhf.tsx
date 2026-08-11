import { ColorPicker as DesignSystemColorPicker } from "@mfe-orchestrator/design-system"
import type { FieldValues } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { DEFAULT_COLORS } from "@/utils/EnviromentsPresets"

type ColorPickerProps<T extends FieldValues> = Parameters<typeof DesignSystemColorPicker<T>>[0]

/** ColorPicker del design system con le etichette tradotte e la palette dell'app. */
const ColorPicker = <T extends FieldValues>(props: ColorPickerProps<T>) => {
    const { t } = useTranslation()

    return <DesignSystemColorPicker<T> presetColors={DEFAULT_COLORS} dialogTitle={t("color_picker.select_color")} cancelLabel={t("common.cancel")} okLabel={t("common.ok")} {...props} />
}

export default ColorPicker
