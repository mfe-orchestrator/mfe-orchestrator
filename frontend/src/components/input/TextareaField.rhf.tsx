import clsx from "clsx"
import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { Controller, FieldError, FieldValues, Path, RegisterOptions, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Label } from "@/components/ui/label"
import { Textarea } from "../ui/textarea"

type TextFieldProps<T extends FieldValues> = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    name: Path<T>
    label: string
    rules?: Omit<RegisterOptions<T, string & Path<T>>, "disabled" | "valueAsNumber" | "valueAsDate" | "setValueAs">
    textTransform?: (value: string) => string
    containerClassName?: string
    secret?: boolean
}

const TextareaField = <T extends FieldValues>({ name, label, rules, className, id, containerClassName, textTransform, secret, ...props }: TextFieldProps<T>) => {
    const {
        control,
        formState: { errors }
    } = useFormContext<T>()
    const { t } = useTranslation()
    const [isSecretVisible, setIsSecretVisible] = useState(false)

    const error = errors[name] as FieldError | undefined
    const inputId = name || id
    const isMasked = secret && !isSecretVisible

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
                    <div className={secret ? "relative" : undefined}>
                        <Textarea
                            disabled={formState.isSubmitting}
                            id={inputId}
                            className={`${className} ${error ? "border-destructive focus-visible:ring-destructive" : ""} ${secret ? "pr-10" : ""} ${isMasked ? "[-webkit-text-security:disc]" : ""}`}
                            {...field}
                            {...props}
                            onChange={e => {
                                field.onChange(textTransform ? textTransform(e.target.value) : e.target.value)
                            }}
                            value={field.value || ""}
                        />
                        {secret && (
                            <button
                                type="button"
                                tabIndex={-1}
                                aria-label={isSecretVisible ? t("auth.hide_password") : t("auth.show_password")}
                                data-testid={`${inputId}-toggle-visibility`}
                                onClick={() => setIsSecretVisible(visible => !visible)}
                                className="absolute right-3 top-3 text-foreground-secondary hover:text-foreground"
                            >
                                {isSecretVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        )}
                    </div>
                    {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
                </div>
            )}
        />
    )
}

export default TextareaField
