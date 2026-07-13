import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import useThemeStore from "@/store/useThemeStore"
import { cn } from "@/utils/styleUtils"
import "react-day-picker/dist/style.css"
import { Controller, FieldError, FieldValues, Path, RegisterOptions, useFormContext } from "react-hook-form"
import { Label } from "@/components/ui/label"
import { Button } from "../atoms/button/Button"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"

type CalendarFieldProps<T extends FieldValues> = {
    name: Path<T>
    id?: string
    label?: string
    rules?: RegisterOptions<T>
    className?: string
    placeholder?: string
    disabled?: boolean
    minDate?: Date
}

const CalendarField = <T extends FieldValues>({ name, label, rules, id, className, placeholder = "Select a date", disabled = false, minDate }: CalendarFieldProps<T>) => {
    const {
        control,
        formState: { errors }
    } = useFormContext<T>()

    const { getLocale } = useThemeStore()

    const error = errors[name] as FieldError | undefined
    const inputId = id || name

    const locale = getLocale()
    const defaultClassNames = getDefaultClassNames()
    const disabledDays = disabled ? true : minDate ? { before: minDate } : undefined

    return (
        <div className={cn("w-full", className)}>
            {label && (
                <Label htmlFor={inputId} className={cn("mb-1 block", error ? "text-destructive" : "text-foreground-secondary")}>
                    {label}
                </Label>
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
                            <DayPicker
                                className="p-3"
                                style={
                                    {
                                        "--rdp-accent-color": "hsl(var(--primary))",
                                        "--rdp-accent-background-color": "hsl(var(--accent))",
                                        "--rdp-today-color": "hsl(var(--primary))",
                                        "--rdp-selected-border": "none",
                                        "--rdp-day-width": "2.25rem",
                                        "--rdp-day-height": "2.25rem"
                                    } as React.CSSProperties
                                }
                                classNames={{
                                    day_button: cn(defaultClassNames.day_button, "rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"),
                                    selected: cn(defaultClassNames.selected, "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary-active [&>button]:font-medium"),
                                    today: cn(defaultClassNames.today, "text-primary font-semibold"),
                                    disabled: cn(defaultClassNames.disabled, "opacity-40")
                                }}
                                animate={true}
                                locale={locale}
                                mode="single"
                                selected={value ? new Date(value) : undefined}
                                onSelect={date => onChange(date)}
                                disabled={disabledDays}
                                initialFocus
                                {...field}
                            />
                        </PopoverContent>
                    </Popover>
                )}
            />
            {error?.message && <p className="mt-1 text-sm text-destructive">{error.message}</p>}
        </div>
    )
}

export default CalendarField
