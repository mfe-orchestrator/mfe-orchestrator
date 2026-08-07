import { CalendarField as DesignSystemCalendarField } from "@mfe-orchestrator/design-system"
import type { FieldValues } from "react-hook-form"
import useThemeStore from "@/store/useThemeStore"

type CalendarFieldProps<T extends FieldValues> = Parameters<typeof DesignSystemCalendarField<T>>[0]

/** CalendarField del design system con il locale scelto nelle preferenze utente. */
const CalendarField = <T extends FieldValues>(props: CalendarFieldProps<T>) => {
    const { getLocale } = useThemeStore()

    return <DesignSystemCalendarField<T> locale={getLocale()} {...props} />
}

export default CalendarField
