import { useState } from "react"
import { Controller, FieldError, FieldValues, Path, RegisterOptions, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { ColorPicker as ColorPickerComponent } from "react-pick-color"
import { Button } from "@/components/ui/button/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DEFAULT_COLORS } from "@/utils/EnviromentsPresets"
import { Label } from "../ui/label"

type ColorPickerCustomProps<T extends FieldValues> = {
    name: Path<T>
    label: string
    rules?: RegisterOptions<T>
    id?: string
    required?: boolean
    className?: string
}

const ColorPicker = <T extends FieldValues>({ id, name, label, rules, required, className }: ColorPickerCustomProps<T>) => {
    const { t } = useTranslation()
    const [showColorPicker, setShowColorPicker] = useState<boolean>(false)
    const [editingColor, setEditingColor] = useState<string>("")

    const {
        control,
        formState: { errors }
    } = useFormContext<T>()

    const error = errors[name] as FieldError | undefined
    const inputId = name || id

    const handlePickerChange = (color: string) => {
        setEditingColor(color)
    }

    return (
        <Controller
            name={name}
            control={control}
            rules={rules}
            render={({ field, formState }) => (
                <div className={`grid gap-2 ${className}`}>
                    {label && (
                        <Label htmlFor={inputId} className={error ? "text-destructive" : ""}>
                            {label}
                            {required && <span className="text-destructive ml-1">*</span>}
                        </Label>
                    )}

                    <div className="relative">
                        <div
                            className="w-8 h-8 rounded-md cursor-pointer border border-gray-300"
                            style={{ backgroundColor: field.value }}
                            onClick={e => {
                                e.stopPropagation()
                                setShowColorPicker(true)
                                setEditingColor(field.value)
                            }}
                        />
                        <Dialog open={showColorPicker} onOpenChange={setShowColorPicker}>
                            <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                    <DialogTitle>{t("color_picker.select_color")}</DialogTitle>
                                </DialogHeader>
                                <div className="py-4">
                                    <ColorPickerComponent color={editingColor || field.value} onChange={e => handlePickerChange(e.hex)} hideInputs />
                                    <div className="grid grid-cols-5 gap-2 mt-3">
                                        {DEFAULT_COLORS.map(color => (
                                            <div
                                                key={color}
                                                className="w-6 h-6 rounded cursor-pointer border border-gray-200"
                                                style={{ backgroundColor: color }}
                                                onClick={e => {
                                                    e.stopPropagation()
                                                    handlePickerChange(color.startsWith("#") ? color : `#${color}`)
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <div className="mt-3 flex items-center justify-between">
                                        <div className="text-sm text-gray-600"></div>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={e => {
                                                    e.stopPropagation()
                                                    setShowColorPicker(false)
                                                    setEditingColor("")
                                                }}
                                            >
                                                {t("common.cancel")}
                                            </Button>
                                            <Button
                                                type="button"
                                                className="bg-purple-600 hover:bg-purple-700 text-white"
                                                onClick={e => {
                                                    e.stopPropagation()
                                                    field.onChange(editingColor || field.value)
                                                    setShowColorPicker(false)
                                                    setEditingColor("")
                                                }}
                                            >
                                                {t("common.ok")}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>

                    {error && <p className="text-sm font-medium text-destructive">{error.message}</p>}
                </div>
            )}
        />
    )
}

export default ColorPicker
