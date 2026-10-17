import { Card, CardContent, CardDescription, CardHeader, CardTitle, SwitchField as Switch } from "@mfe-orchestrator/design-system"
import { Plus, Trash2 } from "lucide-react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"

/** The environment variables the container expects: only the definition lives here, never a value. */
export const ServiceEnvFields: React.FC = () => {
    const { t } = useTranslation()
    const { control } = useFormContext()
    const { fields, append, remove } = useFieldArray({ control, name: "env" })

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div>
                        <CardTitle className="mb-0">{t("services.env.title")}</CardTitle>
                        <CardDescription>{t("services.env.description")}</CardDescription>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => append({ name: "", required: false, secret: false, description: "" })}>
                        <Plus />
                        {t("services.env.add")}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-3">
                {fields.length === 0 && <p className="text-sm text-foreground-secondary">{t("services.env.empty")}</p>}
                {fields.map((field, index) => (
                    <div key={field.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-md border border-divider p-3">
                        <TextField
                            name={`env.${index}.name`}
                            label={t("services.env.name")}
                            placeholder="DATABASE_URL"
                            textTransform={value => value.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}
                            required
                            containerClassName="flex-[1_1_200px]"
                        />
                        <TextField name={`env.${index}.description`} label={t("services.env.variable_description")} containerClassName="flex-[2_1_240px]" />
                        <div className="flex items-center gap-4 pt-7">
                            <Switch name={`env.${index}.required`} label={t("services.env.required")} />
                            <Switch name={`env.${index}.secret`} label={t("services.env.secret")} />
                            <Button type="button" variant="secondary" size="sm" aria-label={t("common.remove")} title={t("common.remove")} onClick={() => remove(index)}>
                                <Trash2 />
                            </Button>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

export default ServiceEnvFields
