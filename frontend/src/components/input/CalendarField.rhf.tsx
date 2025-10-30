import { format } from "date-fns"
import { enUS, it, fr, de, es } from "date-fns/locale"
import { Controller, FieldError, FieldValues, Path, useFormContext } from "react-hook-form"
import { DayPicker } from "react-day-picker"
import "react-day-picker/dist/style.css"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Button } from "../ui/button/button"
import { Calendar as CalendarIcon } from "lucide-react"
import { cn } from "@/utils/styleUtils"
import useUserStore from "@/store/useUserStore"
import useThemeStore from "@/store/useThemeStore"

type CalendarFieldProps<T extends FieldValues> = {
    name: Path<T>
    id?: string
    label?: string
    rules?: any
    className?: string
    placeholder?: string
    disabled?: boolean
}

const CalendarField = <T extends FieldValues>({ name, label, rules, id, className, placeholder = "Select a date", disabled = false }: CalendarFieldProps<T>) => {
    const {
        control,
        formState: { errors }
    } = useFormContext<T>()

    const { language } = useThemeStore()

    const error = errors[name] as FieldError | undefined
    const inputId = id || name

    const locale = language === "it" ? it : language === "fr" ? fr : language === "de" ? de : language === "es" ? es : enUS

    return (
        <div className={cn("w-full", className)}>
            {label && (
                <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
            )}
            <Controller
                name={name}
                control={control}
                rules={rules}
                render={({ field: { onChange, value, ...field } }) => (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="secondary" className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")} disabled={disabled}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {value ? format(new Date(value), "PPP", { locale }) : <span>{placeholder}</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <DayPicker animate={true} locale={locale} mode="single" selected={value ? new Date(value) : undefined} onSelect={date => onChange(date)} disabled={disabled} initialFocus {...field} />
                        </PopoverContent>
                    </Popover>
                )}
            />
            {error?.message && <p className="mt-1 text-sm text-destructive">{error.message}</p>}
        </div>
    )
}

export default CalendarField
