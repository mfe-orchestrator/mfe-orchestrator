import { Alert, AlertDescription, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox } from "@mfe-orchestrator/design-system"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import type { VariableMap, VariableMapKind } from "@/hooks/apiClients/useVariableMapsApi"
import { VARIABLE_MAP_KINDS } from "@/pages/variable-maps/partials/variableMaps"

const FIELD: Record<VariableMapKind, "configMapIds" | "secretIds"> = { configMap: "configMapIds", secret: "secretIds" }

/** The maps of one kind the service may attach, a checkbox each */
const MapChoices: React.FC<{ kind: VariableMapKind; maps: VariableMap[] }> = ({ kind, maps }) => {
    const { t } = useTranslation()
    const { control } = useFormContext()
    const { listPath, i18n: prefix } = VARIABLE_MAP_KINDS[kind]

    return (
        <fieldset className="flex min-w-0 flex-[1_1_280px] flex-col gap-2">
            <legend className="mb-2 flex w-full items-baseline justify-between gap-2 text-sm font-semibold">
                {t(`${prefix}.list_title`)}
                <Link to={listPath} className="text-xs font-normal underline-offset-4 hover:underline">
                    {t("variableMaps.attach.manage")}
                </Link>
            </legend>
            {maps.length === 0 ? (
                <p className="text-sm text-foreground-secondary">{t(`${prefix}.empty_title`)}</p>
            ) : (
                <Controller
                    control={control}
                    name={FIELD[kind]}
                    render={({ field }) => {
                        const selected: string[] = field.value ?? []
                        return (
                            <ul className="flex flex-col divide-y divide-divider rounded-md border border-divider">
                                {maps.map(map => (
                                    <li key={map._id} className="flex items-start gap-3 p-3">
                                        <Checkbox
                                            id={`${kind}-${map._id}`}
                                            className="mt-0.5"
                                            checked={selected.includes(map._id!)}
                                            onCheckedChange={checked => field.onChange(checked === true ? [...selected, map._id!] : selected.filter(id => id !== map._id))}
                                        />
                                        <label htmlFor={`${kind}-${map._id}`} className="min-w-0 flex-1 cursor-pointer">
                                            <span className="block truncate font-mono text-sm font-medium">{map.name}</span>
                                            <span className="block truncate text-xs text-foreground-secondary">
                                                {map.entries.length > 0 ? map.entries.map(entry => entry.key).join(", ") : t("variableMaps.entries.empty")}
                                            </span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        )
                    }}
                />
            )}
        </fieldset>
    )
}

/**
 * The config maps and the secrets the service receives as environment variables. They live in their own
 * sections and can be shared: here they are only attached.
 */
export const ServiceVariableMapsFields: React.FC<{ configMaps: VariableMap[]; secrets: VariableMap[] }> = ({ configMaps, secrets }) => {
    const { t } = useTranslation()
    const [configMapIds = [], secretIds = []] = useWatch({ name: ["configMapIds", "secretIds"] }) as [string[] | undefined, string[] | undefined]

    // The backend refuses it as well: said here, the user sees it before saving
    const owners = new Map<string, string>()
    let clash: { key: string; first: string; second: string } | undefined
    for (const map of [...configMaps.filter(map => configMapIds.includes(map._id!)), ...secrets.filter(map => secretIds.includes(map._id!))]) {
        for (const { key } of map.entries) {
            const owner = owners.get(key)
            if (owner !== undefined && !clash) clash = { key, first: owner, second: map.name }
            owners.set(key, map.name)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("variableMaps.attach.title")}</CardTitle>
                <CardDescription>{t("variableMaps.attach.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-3">
                <div className="flex flex-wrap gap-4">
                    <MapChoices kind="configMap" maps={configMaps} />
                    <MapChoices kind="secret" maps={secrets} />
                </div>
                {clash && (
                    <Alert variant="destructive">
                        <AlertDescription>{t("variableMaps.errors.key_clash", clash)}</AlertDescription>
                    </Alert>
                )}
            </CardContent>
        </Card>
    )
}

export default ServiceVariableMapsFields
