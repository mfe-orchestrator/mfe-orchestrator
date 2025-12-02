import { X } from "lucide-react"
import { InputHTMLAttributes } from "react"
import { Controller, FieldError, FieldValues, Path, RegisterOptions, useFormContext } from "react-hook-form"
import { Label } from "@/components/ui/label"
import { SelectContent } from "../ui/select/partials/selectContent/selectContent"
import { SelectItem } from "../ui/select/partials/selectItem/selectItem"
import { SelectTrigger } from "../ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "../ui/select/select"

type SelectFieldProps<T extends FieldValues> = InputHTMLAttributes<HTMLInputElement> & {
    name: Path<T>
    label?: string
    rules?: Omit<RegisterOptions<T, string & Path<T>>, "disabled" | "valueAsNumber" | "valueAsDate" | "setValueAs">
    options: { value: string; label: string; icon?: string }[]
    containerClassName?: string
    addClearButton?: boolean
    onValueChange?: (value: string) => void
}

const SelectField = <T extends FieldValues>({ name, label, rules, className, containerClassName, id, options = [], placeholder, addClearButton, onValueChange, ...props }: SelectFieldProps<T>) => {
    const {
        control,
        formState: { errors }
    } = useFormContext<T>()

    const error = errors[name] as FieldError | undefined
    const inputId = name || id

    return (
        <Controller
            name={name}
            control={control}
            rules={rules}
            render={({ field, formState }) => (
                <div className={`grid gap-1 ${containerClassName || ""}`}>
                    {label && (
                        <Label htmlFor={inputId} className={error ? "text-destructive" : ""}>
                            {label}
                            {props.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                    )}
                    <Select
                        value={field.value || ""}
                        onValueChange={value => {
                            field.onChange(value)
                            onValueChange?.(value)
                        }}
                        disabled={formState.isSubmitting}
                    >
                        <SelectTrigger className="relative">
                            <SelectValue placeholder={placeholder}>
                                {field.value ? (
                                    <div className="flex items-center gap-2">
                                        {options.find(option => option.value === field.value)?.icon && (
                                            <img src={options.find(option => option.value === field.value)?.icon} alt="" className="w-4 h-4" />
                                        )}
                                        {options.find(option => option.value === field.value)?.label}
                                    </div>
                                ) : (
                                    placeholder
                                )}
                            </SelectValue>
                            {addClearButton && field.value && (
                                <button
                                    type="button"
                                    onMouseDown={e => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                    }}
                                    onClick={e => {
                                        e.stopPropagation()
                                        e.preventDefault()
                                        field.onChange("")
                                    }}
                                    className="absolute right-8 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-sm transition-colors z-10"
                                >
                                    <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                </button>
                            )}
                        </SelectTrigger>
                        <SelectContent>
                            {options.length > 0 ? (
                                options.map(option => (
                                    <SelectItem key={option.value} value={option.value}>
                                        <div className="flex items-center gap-2">
                                            {option.icon && <img src={option.icon} alt="" className="w-4 h-4" />}
                                            {option.label}
                                        </div>
                                    </SelectItem>
                                ))
                            ) : (
                                <span className="text-sm text-foreground-secondary px-2">No options available</span>
                            )}
                        </SelectContent>
                    </Select>
                    {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
                </div>
            )}
        />
    )
}

export default SelectField
