import { EmptyState, SearchInput, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { CirclePlus, PackageOpen, SearchX } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import type { VariableMapKind } from "@/hooks/apiClients/useVariableMapsApi"
import useProjectStore from "@/store/useProjectStore"
import { useVariableMapsQuery, VARIABLE_MAP_KINDS } from "./partials/variableMaps"

/** The config maps or the secrets of the project, with the services attaching each one */
const VariableMaps: React.FC<{ kind: VariableMapKind }> = ({ kind }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const projectId = useProjectStore(state => state.project?._id)
    const servicesApi = useServicesApi()
    const [searchTerm, setSearchTerm] = useState("")
    const { detailPath, i18n: prefix } = VARIABLE_MAP_KINDS[kind]
    const field = kind === "configMap" ? "configMapIds" : "secretIds"

    const mapsQuery = useVariableMapsQuery(kind)
    const servicesQuery = useQuery({ queryKey: ["services", projectId], queryFn: servicesApi.getAll, enabled: !!projectId })

    const servicesOf = useCallback((mapId: string) => (servicesQuery.data ?? []).filter(service => service[field]?.includes(mapId)), [servicesQuery.data, field])

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase()
        if (!term) return mapsQuery.data ?? []
        return (mapsQuery.data ?? []).filter(map =>
            [map.name, map.description ?? "", ...map.entries.map(entry => entry.key), ...servicesOf(map._id!).map(service => service.name)].some(text => text.toLowerCase().includes(term))
        )
    }, [mapsQuery.data, searchTerm, servicesOf])

    const hasMaps = (mapsQuery.data?.length ?? 0) > 0
    const onCreate = () => navigate(detailPath("new"))

    return (
        <SinglePageLayout
            title={t(`${prefix}.list_title`)}
            description={t(`${prefix}.list_description`)}
            lrContainerClassname="items-end"
            left={
                hasMaps ? (
                    <SearchInput
                        className="max-w-sm"
                        placeholder={t("variableMaps.list.search_placeholder")}
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                        onClear={() => setSearchTerm("")}
                        clearLabel={t("variableMaps.list.clear_search")}
                    />
                ) : null
            }
            right={
                <Button variant="primary" onClick={onCreate}>
                    <CirclePlus />
                    {t(`${prefix}.add_new`)}
                </Button>
            }
        >
            <ApiStatusHandler queries={[mapsQuery, servicesQuery]}>
                {!hasMaps ? (
                    <EmptyState
                        variant="outlined"
                        size="lg"
                        tone="primary"
                        icon={<PackageOpen />}
                        title={t(`${prefix}.empty_title`)}
                        description={t(`${prefix}.empty_description`)}
                        actions={
                            <Button onClick={onCreate}>
                                <CirclePlus />
                                {t(`${prefix}.add_new`)}
                            </Button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        variant="outlined"
                        size="lg"
                        tone="primary"
                        icon={<SearchX />}
                        title={t("variableMaps.list.no_results_title")}
                        description={t("variableMaps.list.no_results_description", { searchTerm })}
                        actions={
                            <Button variant="secondary" onClick={() => setSearchTerm("")}>
                                {t("variableMaps.list.clear_search")}
                            </Button>
                        }
                    />
                ) : (
                    <div className="overflow-hidden rounded-lg border-2 border-border bg-card">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/60 hover:bg-muted/60">
                                    <TableHead>{t("variableMaps.name")}</TableHead>
                                    <TableHead>{t("variableMaps.description")}</TableHead>
                                    <TableHead>{t("variableMaps.list.keys")}</TableHead>
                                    <TableHead>{t("variableMaps.used_by.title")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map(map => {
                                    const services = servicesOf(map._id!)
                                    return (
                                        <TableRow key={map._id} className="cursor-pointer border-divider hover:bg-primary/5" onClick={() => navigate(detailPath(map._id!))}>
                                            <TableCell className="max-w-[16rem] truncate font-mono font-medium" title={map.name}>
                                                {map.name}
                                            </TableCell>
                                            <TableCell className="max-w-[20rem] truncate text-foreground-secondary" title={map.description}>
                                                {map.description || "—"}
                                            </TableCell>
                                            <TableCell>{map.entries.length}</TableCell>
                                            <TableCell>
                                                {services.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {services.map(service => (
                                                            <Link key={service._id} to={`/service/${service._id}`} onClick={event => event.stopPropagation()}>
                                                                <Badge variant="outline">{service.name}</Badge>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-foreground-secondary">{t("variableMaps.used_by.none")}</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </ApiStatusHandler>
        </SinglePageLayout>
    )
}

export default VariableMaps
