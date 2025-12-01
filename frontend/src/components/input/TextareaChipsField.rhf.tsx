import clsx from "clsx"
import { X } from "lucide-react"
import { useState } from "react"
import { Controller, FieldError, FieldValues, Path, RegisterOptions, useFormContext } from "react-hook-form"
import { Label } from "@/components/ui/label"

type TextareaChipsFieldProps<T extends FieldValues> = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    name: Path<T>
    label: string
    rules?: Omit<RegisterOptions<T, string & Path<T>>, "disabled" | "valueAsNumber" | "valueAsDate" | "setValueAs">
    textTransform?: (value: string) => string
    containerClassName?: string
}

const TextareaChipsField = <T extends FieldValues>({ name, label, rules, className, id, containerClassName, textTransform, ...props }: TextareaChipsFieldProps<T>) => {
    const {
        control,
        formState: { errors }
    } = useFormContext<T>()

    const [inputValue, setInputValue] = useState("")
    const error = errors[name] as FieldError | undefined
    const inputId = name || id

    return (
        <Controller
            name={name}
            control={control}
            rules={rules}
            render={({ field, formState }) => {
                const chips: string[] = Array.isArray(field.value) ? field.value : []

                const addChip = (value: string) => {
                    const values = value
                        .split(",")
                        .map(v => v.trim())
                        .filter(v => v)
                    const newChips = values.filter(v => !chips.includes(v)).map(v => (textTransform ? textTransform(v) : v))

                    if (newChips.length > 0) {
                        field.onChange([...chips, ...newChips])
                    }
                    setInputValue("")
                }

                const removeChip = (index: number) => {
                    field.onChange(chips.filter((_, i) => i !== index))
                }

                const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                    if (e.key === "Enter") {
                        e.preventDefault()
                        addChip(inputValue)
                    } else if (e.key === "Backspace" && inputValue === "" && chips.length > 0) {
                        removeChip(chips.length - 1)
                    }
                }

                return (
                    <div className={clsx(`flex flex-col gap-1`, containerClassName)}>
                        <Label htmlFor={inputId} className={error ? "text-destructive" : "text-foreground-secondary"}>
                            {label}
                            {props.required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                        <div
                            className={clsx(
                                "min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                                error && "border-destructive focus-within:ring-destructive"
                            )}
                        >
                            {chips.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {chips.map((chip, index) => (
                                        <div key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-md text-sm">
                                            <span>{chip}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeChip(index)}
                                                disabled={formState.isSubmitting}
                                                className="hover:bg-primary/20 rounded-sm p-0.5 transition-colors"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <textarea
                                disabled={formState.isSubmitting}
                                id={inputId}
                                className="flex min-h-[80px] w-full bg-transparent outline-none resize-none text-sm placeholder:text-foreground/45 focus-visible:outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                onBlur={() => {
                                    if (inputValue.trim()) {
                                        addChip(inputValue)
                                    }
                                }}
                                rows={1}
                                {...props}
                            />
                        </div>
                        {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
                    </div>
                )
            }}
        />
    )
}

export default TextareaChipsField
