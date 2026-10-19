import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Badge } from "@/components/atoms"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import type { Service } from "@/hooks/apiClients/useServicesApi"
import type { VariableMap, VariableMapKind } from "@/hooks/apiClients/useVariableMapsApi"
import VariableEntriesTable from "@/pages/variable-maps/partials/VariableEntriesTable"
import { VARIABLE_MAP_KINDS } from "@/pages/variable-maps/partials/variableMaps"

/** What the service receives from the config maps and the secrets it attaches, a table per map */
export const ServiceVariableMapsSection: React.FC<{ service: Service; configMaps: VariableMap[]; secrets: VariableMap[]; environments: EnvironmentDTO[] }> = ({
    service,
    configMaps,
    secrets,
    environments
}) => {
    const { t } = useTranslation()
    const attached: Array<[VariableMapKind, VariableMap]> = [
        ...configMaps.filter(map => service.configMapIds?.includes(map._id!)).map(map => ["configMap", map] as [VariableMapKind, VariableMap]),
        ...secrets.filter(map => service.secretIds?.includes(map._id!)).map(map => ["secret", map] as [VariableMapKind, VariableMap])
    ]

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("variableMaps.attach.title")}</CardTitle>
                <CardDescription>{t("variableMaps.attach.detail_description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6 pt-3">
                {attached.length === 0 && <p className="text-sm text-foreground-secondary">{t("variableMaps.attach.none")}</p>}
                {attached.map(([kind, map]) => (
                    <div key={`${kind}-${map._id}`} className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Link to={VARIABLE_MAP_KINDS[kind].detailPath(map._id!)} className="font-mono font-semibold underline-offset-4 hover:underline">
                                {map.name}
                            </Link>
                            <Badge variant="outline">{t(`${VARIABLE_MAP_KINDS[kind].i18n}.label`)}</Badge>
                        </div>
                        <VariableEntriesTable kind={kind} entries={map.entries} environments={environments} />
                    </div>
                ))}
            </CardContent>
        </Card>
    )
}

export default ServiceVariableMapsSection
