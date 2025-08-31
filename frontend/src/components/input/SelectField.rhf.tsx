import { Label } from "@/components/ui/label"
import { InputHTMLAttributes } from "react"
import { Controller, FieldError, FieldValues, Path, useFormContext } from "react-hook-form"
import { SelectContent } from "../ui/select/partials/selectContent/selectContent"
import { SelectItem } from "../ui/select/partials/selectItem/selectItem"
import { SelectTrigger } from "../ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "../ui/select/select"

type SelectFieldProps<T extends FieldValues> = InputHTMLAttributes<HTMLInputElement> & {
    name: Path<T>
    label?: string
    rules?: any
    options: { value: string; label: string }[]
    containerClassName?: string
}

const SelectField = <T extends FieldValues>({ name, label, rules, className, containerClassName, id, options, placeholder, ...props }: SelectFieldProps<T>) => {
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
                <div className={`grid gap-2 ${containerClassName || ""}`}>
                    {label && (
                        <Label htmlFor={inputId} className={error ? "text-destructive" : ""}>
                            {label}
                            {props.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                    )}
                    <Select value={field.value || ""} onValueChange={field.onChange} disabled={formState.isSubmitting}>
                        <SelectTrigger>
                            <SelectValue placeholder={placeholder}>{options.find(option => option.value === field.value)?.label || placeholder}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {options.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
                </div>
            )}
        />
    )
}

export default SelectField
