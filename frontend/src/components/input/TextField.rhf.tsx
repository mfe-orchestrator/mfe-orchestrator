import { InputHTMLAttributes } from 'react';
import { Controller, FieldError, FieldValues, Path, RegisterOptions, useFormContext } from "react-hook-form"
import { Label } from "@/components/ui/label"
import { Input, InputProps } from "@/components/ui/input/input"
import clsx from "clsx"

type TextFieldProps<T extends FieldValues> = InputProps & {
    name: Path<T>
    label: string
    rules?: Omit<RegisterOptions<T, string & Path<T>>, "disabled" | "valueAsNumber" | "valueAsDate" | "setValueAs">
    textTransform?: (value: string) => string
    containerClassName?: string
}

const TextField = <T extends FieldValues>({ name, label, rules, className, id, containerClassName, textTransform, disabled, ...props }: TextFieldProps<T>) => {
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
                <div className={clsx(`flex flex-col gap-1`, containerClassName)}>
                    <Label htmlFor={inputId} className={error ? "text-destructive" : "text-foreground-secondary"}>
                        {label}
                        {props.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    <Input
                        disabled={disabled || formState.isSubmitting}
                        id={inputId}
                        className={`${className} ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
                        {...field}
                        {...props}
                        onChange={e => {
                            field.onChange(textTransform ? textTransform(e.target.value) : e.target.value)
                            props.onChange?.(e)
                        }}
                        value={field.value || ""}
                    />
                    {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
                </div>
            )}
        />
    )
}

export default TextField;