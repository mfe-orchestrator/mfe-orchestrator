import { Card, CardContent, CardDescription, CardHeader, CardTitle, SearchInput } from "@mfe-orchestrator/design-system"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { FieldError, get, useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import type { VariableMapKind } from "@/hooks/apiClients/useVariableMapsApi"
import { cn } from "@/utils/styleUtils"
import { VARIABLE_MAP_KINDS, type VariableEntryFormValue } from "./variableMaps"

/** The keys of a config map or of a secret: a row per key, a value per environment. */
export const VariableEntriesFields: React.FC<{ kind: VariableMapKind; environments: EnvironmentDTO[] }> = ({ kind, environments }) => {
    const { t } = useTranslation()
    const {
        control,
        formState: { errors }
    } = useFormContext()
    const { fields, append, remove } = useFieldArray({ control, name: "entries" })
    const entries = useWatch({ control, name: "entries" }) as VariableEntryFormValue[] | undefined
    const [searchTerm, setSearchTerm] = useState("")
    const isSecret = kind === "secret"
    const prefix = VARIABLE_MAP_KINDS[kind].i18n

    const term = searchTerm.trim().toLowerCase()
    // A secret matches on its key only: its values are placeholders, or ones the user is typing in
    const matches = (entry?: VariableEntryFormValue) => !term || entry?.key.toLowerCase().includes(term) || (!isSecret && entry?.values.some(value => value.toLowerCase().includes(term)))
    // A key in error must stay in sight whatever the search
    const isVisible = (index: number) => matches(entries?.[index]) || Boolean(get(errors, `entries.${index}.key`))
    const visibleCount = fields.filter((_, index) => isVisible(index)).length

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
                    <div>
                        <CardTitle className="mb-0">{t(`${prefix}.entries.title`)}</CardTitle>
                        <CardDescription>{t(`${prefix}.entries.description`)}</CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            // The new key has no name yet: under a search it would vanish at the first letter typed
                            setSearchTerm("")
                            append({ key: "", values: environments.map(() => ""), saved: false } satisfies VariableEntryFormValue)
                        }}
                    >
                        <Plus />
                        {t("variableMaps.entries.add")}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-3">
                {fields.length > 0 && (
                    <SearchInput
                        className="max-w-sm"
                        placeholder={t(isSecret ? "variableMaps.entries.search_placeholder_secret" : "variableMaps.entries.search_placeholder")}
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                        onClear={() => setSearchTerm("")}
                        clearLabel={t("variableMaps.list.clear_search")}
                        // Inside the form: Enter would submit it
                        onKeyDown={event => event.key === "Enter" && event.preventDefault()}
                    />
                )}
                {fields.length === 0 && <p className="text-sm text-foreground-secondary">{t("variableMaps.entries.empty")}</p>}
                {fields.length > 0 && visibleCount === 0 && <p className="text-sm text-foreground-secondary">{t("variableMaps.entries.no_results", { searchTerm })}</p>}
                {fields.map((field, index) => {
                    // A saved secret is sent back as placeholders, which the backend resolves by key: renaming it would orphan them
                    const keyLocked = isSecret && (field as unknown as VariableEntryFormValue).saved
                    // The design system TextField looks errors up by the flat name, which misses one inside a list
                    const keyError = get(errors, `entries.${index}.key`) as FieldError | undefined

                    return (
                        // Hidden, not unmounted: the values typed in a row the search leaves out stay in the form
                        <div key={field.id} className={cn("flex-col gap-2 rounded-md border border-divider p-3", isVisible(index) ? "flex" : "hidden")}>
                            <div className="flex items-start gap-4">
                                <TextField
                                    name={`entries.${index}.key`}
                                    label={t("variableMaps.entries.key")}
                                    placeholder={isSecret ? "DATABASE_PASSWORD" : "LOG_LEVEL"}
                                    textTransform={value => value.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}
                                    description={keyLocked ? t("variableMaps.secret.key_locked") : undefined}
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
                                        name={`entries.${index}.values.${environmentIndex}`}
                                        label={environment.name}
                                        placeholder={t("variableMaps.entries.not_set")}
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

export default VariableEntriesFields
