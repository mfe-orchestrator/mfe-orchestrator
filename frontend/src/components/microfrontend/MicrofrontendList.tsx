import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import { Badge } from "@/components/ui/badge/badge"
import { Button } from "@/components/ui/button/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { useQuery } from "@tanstack/react-query"
import { LayoutGrid, StretchHorizontal, Workflow } from "lucide-react"
import React, { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import MicrofrontendCard from "../../components/microfrontend/MicrofrontendCard"
import { TabsContent } from "../ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "../ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "../ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "../ui/tabs/tabs"
import AddNewMicrofrontendCard from "./AddNewMicrofrontendCard"
import NoMicrofrontendPlaceholder from "./NoMicrofrontendPlaceholder"
import MicrofrontendFlowLayout from "./MicrofrontendFlowLayout"

interface MicrofrontendListProps {
    searchTerm?: string
    projectId?: string
    onResetFilters: () => void
    setTabsValue: (value: "grid" | "list") => void
    onAddNewMicrofrontend: (parentId?: string) => void
}

interface MicrofrontendListRealProps {
    microfrontends: Microfrontend[]
    onResetFilters: () => void
    setTabsValue: (value: "grid" | "list" | "flow") => void
    onAddNewMicrofrontend: (parentId?: string) => void
}

const MicrofrontendListReal: React.FC<MicrofrontendListRealProps> = ({ microfrontends, onResetFilters, setTabsValue, onAddNewMicrofrontend }) => {
    const { t } = useTranslation("platform")
    const navigate = useNavigate()
    

    return (
        <Tabs defaultValue="grid" className="space-y-4" iconButtons tabsListPosition="end">
            <div className="flex items-start justify-between gap-x-6 gap-y-2 flex-wrap">
                <div className="flex-[1_1_280px] max-w-[600px]">
                    <h2 className="text-xl font-semibold text-foreground-secondary">
                        {microfrontends.length > 0 ? `${microfrontends.length} ${t("microfrontend.dashboard.title")}` : t("microfrontend.no_microfrontends_found")}
                    </h2>
                    {microfrontends.length === 0 && <p className="text-foreground-secondary mt-1">{t("microfrontend.no_microfrontends_found_description")}</p>}
                </div>
                <TabsList>
                    <TabsTrigger value="flow" onClick={() => setTabsValue("flow")}>
                        <Workflow />
                    </TabsTrigger>
                    <TabsTrigger value="grid" onClick={() => setTabsValue("grid")}>
                        <LayoutGrid />
                    </TabsTrigger>
                    <TabsTrigger value="list" onClick={() => setTabsValue("list")}>
                        <StretchHorizontal />
                    </TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="flow">
                <MicrofrontendFlowLayout microfrontends={microfrontends} onAddNewMicrofrontend={onAddNewMicrofrontend} />
            </TabsContent>
            <TabsContent value="grid">
                <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,_1fr))]">
                    <AddNewMicrofrontendCard onAddNewMicrofrontend={onAddNewMicrofrontend} className={microfrontends.length === 0 && "col-span-4"} />
                    {microfrontends.map(mfe => (
                        <MicrofrontendCard key={mfe._id} mfe={mfe} />
                    ))}
                </div>
            </TabsContent>

            <TabsContent value="list">
                <div className="rounded-md border-2 border-border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-primary/25">
                                <TableHead className="text-foreground">{t("common.name")}</TableHead>
                                <TableHead className="text-foreground">{t("microfrontend.slug")}</TableHead>
                                <TableHead className="text-foreground">{t("microfrontend.version")}</TableHead>
                                <TableHead className="text-foreground">{t("microfrontend.canary_release")}</TableHead>
                                <TableHead className="text-foreground"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {microfrontends.length > 0 ? (
                                microfrontends?.map(mfe => {
                                    const canaryPercentage: number = mfe.canary?.percentage || 0
                                    return (
                                        <TableRow key={mfe._id}>
                                            <TableCell className="font-medium text-primary">{mfe.name}</TableCell>
                                            <TableCell>{mfe.slug}</TableCell>
                                            <TableCell>
                                                <Badge>{mfe.version}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                {canaryPercentage > 0 ? (
                                                    <span>
                                                        {canaryPercentage}% {t("microfrontend.ofUsers")}
                                                    </span>
                                                ) : (
                                                    <span className="italic text-foreground-secondary">{t("common.no_data")}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="primary" size="sm" onClick={() => navigate(`/microfrontend/${mfe._id}`)} className="w-full">
                                                    {t("common.configuration")}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={100} className="h-24 text-center">
                                        <span className="text-foreground-secondary">{t("microfrontend.no_microfrontends_found")}</span>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>
        </Tabs>
    )
}

const MicrofrontendList: React.FC<MicrofrontendListProps> = ({ searchTerm, projectId, onResetFilters, setTabsValue, onAddNewMicrofrontend }) => {
    const microfrontendsApi = useMicrofrontendsApi()

    const microfrontendListQuery = useQuery({
        queryKey: ["microfrontends-by-project-id", projectId],
        queryFn: () => microfrontendsApi.getByProjectId(projectId),
        enabled: !!projectId
    })

    const microfrontendListReal = useMemo(() => {
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

    return (
        <ApiDataFetcher queries={[microfrontendListQuery]}>
            <MicrofrontendListReal onAddNewMicrofrontend={onAddNewMicrofrontend} microfrontends={microfrontendListReal} onResetFilters={onResetFilters} setTabsValue={setTabsValue} />
            {/* {microfrontendListQuery?.data?.length !== 0 ? (
            ) : (
                <NoMicrofrontendPlaceholder projectId={projectId} />
            )} */}
        </ApiDataFetcher>
    )
}

export default MicrofrontendList
