import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { Plus, Trash2 } from "lucide-react"
import { FieldError, get, useFieldArray, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import type { ServiceVariableFormValue, ServiceVariablesKind } from "./serviceVariables"

const TITLE_KEY: Record<ServiceVariablesKind, string> = { configMap: "services.config_map", secrets: "services.secrets" }

/** The config map or the secrets of a service: a row per key, a value per environment. */
export const ServiceVariablesFields: React.FC<{ kind: ServiceVariablesKind; environments: EnvironmentDTO[] }> = ({ kind, environments }) => {
    const { t } = useTranslation()
    const {
        control,
        formState: { errors }
    } = useFormContext()
    const { fields, append, remove } = useFieldArray({ control, name: kind })
    const isSecret = kind === "secrets"
    const prefix = TITLE_KEY[kind]

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div>
                        <CardTitle className="mb-0">{t(`${prefix}.title`)}</CardTitle>
                        <CardDescription>{t(`${prefix}.description`)}</CardDescription>
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={() => append({ key: "", values: environments.map(() => ""), saved: false } satisfies ServiceVariableFormValue)}>
                        <Plus />
                        {t(`${prefix}.add`)}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-3">
                {fields.length === 0 && <p className="text-sm text-foreground-secondary">{t(`${prefix}.empty`)}</p>}
                {fields.map((field, index) => {
                    // A saved secret is sent back as placeholders, which the backend resolves by key: renaming it would orphan them
                    const keyLocked = isSecret && (field as unknown as ServiceVariableFormValue).saved
                    // The design system TextField looks errors up by the flat name, which misses one inside a list
                    const keyError = get(errors, `${kind}.${index}.key`) as FieldError | undefined

                    return (
                        <div key={field.id} className="flex flex-col gap-2 rounded-md border border-divider p-3">
                            <div className="flex items-start gap-4">
                                <TextField
                                    name={`${kind}.${index}.key`}
                                    label={t("services.variables.key")}
                                    placeholder={isSecret ? "DATABASE_PASSWORD" : "LOG_LEVEL"}
                                    textTransform={value => value.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}
                                    description={keyLocked ? t("services.secrets.key_locked") : undefined}
                                    disabled={keyLocked}
                                    required
                                    containerClassName="flex-[1_1_200px]"
                                />
                                <Button type="button" variant="secondary" size="sm" className="mt-7" aria-label={t("common.remove")} title={t("common.remove")} onClick={() => remove(index)}>
                                    <Trash2 />
                                </Button>
                            </div>
                            {keyError?.message && (
                                <p role="alert" className="text-sm font-medium text-destructive">
                                    {keyError.message}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {environments.map((environment, environmentIndex) => (
                                    <TextField
                                        key={environment._id}
                                        name={`${kind}.${index}.values.${environmentIndex}`}
                                        label={environment.name}
                                        placeholder={t("services.variables.not_set")}
                                        type={isSecret ? "password" : undefined}
                                        // Not a login: keep password managers from filling one in
                                        autoComplete={isSecret ? "new-password" : "off"}
                                        containerClassName="flex-[1_1_200px]"
                                    />
                                ))}
                            </div>
                        </div>
                    )
                })}
            </CardContent>
        </Card>
    )
}

export default ServiceVariablesFields
