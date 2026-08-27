import { SearchInput, Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { CirclePlus, DownloadCloud, LayoutGrid, StretchHorizontal, Workflow } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi"
import useProjectStore from "@/store/useProjectStore"
import { ImportRepositoriesDialog, MicrofrontendsEmptyState } from "./partials/components"
import { MicrofrontendFlow, MicrofrontendsGrid, MicrofrontendsTable } from "./partials/views"

const VIEWS = [
    { value: "flow", icon: Workflow, labelKey: "microfrontend.dashboard.viewFlow" },
    { value: "grid", icon: LayoutGrid, labelKey: "microfrontend.dashboard.viewGrid" },
    { value: "table", icon: StretchHorizontal, labelKey: "microfrontend.dashboard.viewTable" }
] as const

type View = (typeof VIEWS)[number]["value"]

const Microfrontends = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()

    const projectStore = useProjectStore()
    const projectId = projectStore.project?._id

    const codeRepositoriesApi = useCodeRepositoriesApi()
    const microfrontendsApi = useMicrofrontendsApi()

    const [searchTerm, setSearchTerm] = useState("")
    const [view, setView] = useState<View>("flow")
    const [importDialogOpen, setImportDialogOpen] = useState(false)

    const onResetFilters = () => {
        setSearchTerm("")
    }

    const microfrontendListQuery = useQuery({
        queryKey: ["microfrontends-by-project-id", projectId],
        queryFn: () => microfrontendsApi.getByProjectId(projectId),
        enabled: !!projectId
    })

    const codeRepositoriesQuery = useQuery({
        queryKey: ["repositories", projectId],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(projectId!),
        enabled: !!projectId
    })

    const codeRepositories = codeRepositoriesQuery.data ?? []
    // Importing repositories only makes sense once at least one provider connection exists.
    const canImportRepositories = codeRepositories.length > 0

    const microfrontendsList = useMemo(() => {
        const data = microfrontendListQuery?.data

        if (!data) {
            return null
        }

        if (!searchTerm) return data

        const filteredData = data.filter(mfe => {
            const nameMatch = searchTerm ? mfe.name.toLowerCase().includes(searchTerm.toLowerCase()) : true
            return nameMatch
        })

        return filteredData
    }, [microfrontendListQuery?.data, searchTerm])

    const totalCount = microfrontendListQuery.data?.length ?? 0
    const filteredCount = microfrontendsList?.length ?? 0
    // The toolbar is only useful once the project actually has something to search through or switch views on.
    const hasMicrofrontends = totalCount > 0

    const onAddNewMicrofrontend = async (parentId?: string) => {
        const repositories = await codeRepositoriesApi.getRepositoriesByProjectId(projectStore.project?._id!)
        if (repositories && repositories.length > 0) {
            if (parentId) {
                navigate(`/templates-library?parentId=${parentId}`)
            } else {
                navigate(`/templates-library`)
            }
        } else {
            if (parentId) {
                navigate(`/microfrontend/new?parentId=${parentId}`)
            } else {
                navigate(`/microfrontend/new`)
            }
        }
    }

    return (
        // The Tabs root wraps the whole layout so the view switcher can live in the page header, next to the primary action.
        // `layoutSize="sm"` is what keeps the switcher aligned with those buttons: TabsList adds its own border and padding
        // around the triggers, so at the default size the group totals 48px against the 40px of a default Button.
        <Tabs value={view} onValueChange={value => setView(value as View)} className="flex min-h-full flex-col" layoutSize="sm" iconButtons tabsListPosition="end">
            <SinglePageLayout
                title={t("microfrontend.dashboard.title")}
                description={t("microfrontend.dashboard.description")}
                lrContainerClassname="items-end"
                left={
                    hasMicrofrontends ? (
                        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1">
                            <SearchInput
                                className="max-w-sm"
                                placeholder={t("microfrontend.dashboard.searchPlaceholder")}
                                value={searchTerm}
                                onValueChange={setSearchTerm}
                                onClear={onResetFilters}
                                clearLabel={t("microfrontend.dashboard.clearSearch")}
                            />
                            <p className="text-sm text-foreground-secondary" aria-live="polite">
                                {searchTerm ? t("microfrontend.dashboard.filteredCount", { count: filteredCount, total: totalCount }) : t("microfrontend.dashboard.totalCount", { count: totalCount })}
                            </p>
                        </div>
                    ) : null
                }
                right={
                    <div className="flex flex-[0_0_auto] items-center gap-2">
                        {hasMicrofrontends && (
                            <TabsList>
                                {VIEWS.map(({ value, icon: Icon, labelKey }) => (
                                    // Labelled via aria-label/title rather than a Radix Tooltip: TooltipTrigger would
                                    // overwrite the trigger's own `data-state`, which is what drives the active styling.
                                    // The shared `accent` active state is a pale wash on this theme, so the selected
                                    // view gets the stronger primary fill.
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
                        {canImportRepositories && (
                            <Button variant="secondary" onClick={() => setImportDialogOpen(true)}>
                                <DownloadCloud />
                                {t("microfrontend.import.action")}
                            </Button>
                        )}
                        <Button variant="primary" onClick={() => onAddNewMicrofrontend()}>
                            <CirclePlus />
                            {t("microfrontend.add_new")}
                        </Button>
                    </div>
                }
            >
                <ApiStatusHandler queries={[microfrontendListQuery]}>
                    {!hasMicrofrontends ? (
                        <MicrofrontendsEmptyState
                            variant="empty"
                            onAddNewMicrofrontend={() => onAddNewMicrofrontend()}
                            onImportRepositories={canImportRepositories ? () => setImportDialogOpen(true) : undefined}
                        />
                    ) : filteredCount === 0 ? (
                        <MicrofrontendsEmptyState variant="no-results" searchTerm={searchTerm} onResetFilters={onResetFilters} />
                    ) : (
                        <>
                            <TabsContent value="flow" className="mt-0">
                                <MicrofrontendFlow microfrontends={microfrontendsList} onAddNewMicrofrontend={onAddNewMicrofrontend} />
                            </TabsContent>
                            <TabsContent value="grid" className="mt-0">
                                <MicrofrontendsGrid microfrontends={microfrontendsList} onAddNewMicrofrontend={onAddNewMicrofrontend} />
                            </TabsContent>
                            <TabsContent value="table" className="mt-0">
                                <MicrofrontendsTable microfrontends={microfrontendsList} />
                            </TabsContent>
                        </>
                    )}
                </ApiStatusHandler>

                {canImportRepositories && <ImportRepositoriesDialog open={importDialogOpen} onOpenChange={setImportDialogOpen} codeRepositories={codeRepositories} />}
            </SinglePageLayout>
        </Tabs>
    )
}

export default Microfrontends
