import { EmptyState, SearchInput, Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { CirclePlus, LayoutGrid, PackageOpen, SearchX, StretchHorizontal } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useServicesApi from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"
import { ServicesGrid } from "./partials/ServicesGrid"
import { ServicesTable } from "./partials/ServicesTable"

const VIEWS = [
    { value: "grid", icon: LayoutGrid, labelKey: "services.list.viewGrid" },
    { value: "table", icon: StretchHorizontal, labelKey: "services.list.viewTable" }
] as const

type View = (typeof VIEWS)[number]["value"]

const Services = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const projectId = useProjectStore(state => state.project?._id)
    const servicesApi = useServicesApi()
    const [searchTerm, setSearchTerm] = useState("")
    const [view, setView] = useState<View>("grid")

    const servicesQuery = useQuery({
        queryKey: ["services", projectId],
        queryFn: servicesApi.getAll,
        enabled: !!projectId
    })

    const filtered = useMemo(() => {
        const term = searchTerm.toLowerCase()
        return (servicesQuery.data ?? []).filter(service => !term || service.name.toLowerCase().includes(term) || service.slug.toLowerCase().includes(term))
    }, [servicesQuery.data, searchTerm])

    const totalCount = servicesQuery.data?.length ?? 0
    const hasServices = totalCount > 0
    // Services are always born from a template: the library, filtered on services, is the entry point.
    const onCreate = () => navigate("/templates-library?type=service")

    return (
        <Tabs value={view} onValueChange={value => setView(value as View)} className="flex min-h-full flex-col" layoutSize="sm" iconButtons tabsListPosition="end">
            <SinglePageLayout
                title={t("services.list.title")}
                description={t("services.list.description")}
                lrContainerClassname="items-end"
                left={
                    hasServices ? (
                        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
                            <SearchInput
                                className="max-w-sm"
                                placeholder={t("services.list.searchPlaceholder")}
                                value={searchTerm}
                                onValueChange={setSearchTerm}
                                onClear={() => setSearchTerm("")}
                                clearLabel={t("services.list.clearSearch")}
                            />
                            <p className="text-sm text-foreground-secondary" aria-live="polite">
                                {searchTerm ? t("services.list.filteredCount", { count: filtered.length, total: totalCount }) : t("services.list.totalCount", { count: totalCount })}
                            </p>
                        </div>
                    ) : null
                }
                right={
                    <div className="flex flex-[0_0_auto] items-center gap-2">
                        {hasServices && (
                            <TabsList>
                                {VIEWS.map(({ value, icon: Icon, labelKey }) => (
                                    <TabsTrigger
                                        key={value}
                                        value={value}
                                        aria-label={t(labelKey)}
                                        title={t(labelKey)}
                                        className="data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:data-[state=active]:bg-primary/85 focus-visible:data-[state=active]:bg-primary/85"
                                    >
                                        <Icon />
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        )}
                        <Button variant="primary" onClick={onCreate}>
                            <CirclePlus />
                            {t("services.add_new")}
                        </Button>
                    </div>
                }
            >
                <ApiStatusHandler queries={[servicesQuery]}>
                    {!hasServices ? (
                        <EmptyState
                            variant="outlined"
                            size="lg"
                            tone="primary"
                            icon={<PackageOpen />}
                            title={t("services.list.emptyTitle")}
                            description={t("services.list.emptyDescription")}
                            actions={
                                <Button onClick={onCreate}>
                                    <CirclePlus />
                                    {t("services.list.createFromTemplate")}
                                </Button>
                            }
                        />
                    ) : filtered.length === 0 ? (
                        <EmptyState
                            variant="outlined"
                            size="lg"
                            tone="primary"
                            icon={<SearchX />}
                            title={t("services.list.noResultsTitle")}
                            description={t("services.list.noResultsDescription", { searchTerm })}
                            actions={
                                <Button variant="secondary" onClick={() => setSearchTerm("")}>
                                    {t("services.list.resetSearch")}
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <TabsContent value="grid" className="mt-0">
                                <ServicesGrid services={filtered} />
                            </TabsContent>
                            <TabsContent value="table" className="mt-0">
                                <ServicesTable services={filtered} />
                            </TabsContent>
                        </>
                    )}
                </ApiStatusHandler>
            </SinglePageLayout>
        </Tabs>
    )
}

export default Services
