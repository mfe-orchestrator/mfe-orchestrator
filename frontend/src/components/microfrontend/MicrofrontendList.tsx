import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import { Badge } from "@/components/ui/badge/badge"
import { Button } from "@/components/ui/button/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { useQuery } from "@tanstack/react-query"
import { LayoutGrid, StretchHorizontal } from "lucide-react"
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

interface MicrofrontendListProps {
    searchTerm?: string
    projectId?: string
    onResetFilters: () => void
    setTabsValue: (value: "grid" | "list") => void
}

interface MicrofrontendListRealProps {
    microfrontends: Microfrontend[]
    onResetFilters: () => void
    setTabsValue: (value: "grid" | "list") => void
}

const MicrofrontendListReal: React.FC<MicrofrontendListRealProps> = ({ microfrontends, onResetFilters, setTabsValue }) => {
    const { t } = useTranslation("platform")
    const navigate = useNavigate()

    const onAddNewMicrofrontend = () => {
        navigate(`/market`)
    }

    return (
        <Tabs defaultValue="grid" className="space-y-4" iconButtons tabsListPosition="end">
            <TabsList>
                <TabsTrigger value="grid" onClick={() => setTabsValue("grid")}>
                    <LayoutGrid />
                </TabsTrigger>
                <TabsTrigger value="list" onClick={() => setTabsValue("list")}>
                    <StretchHorizontal />
                </TabsTrigger>
            </TabsList>

            <TabsContent value="grid">
                {microfrontends && microfrontends.length > 0 ? (
                    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,_1fr))]">
                        <AddNewMicrofrontendCard onAddNewMicrofrontend={onAddNewMicrofrontend} />
                        {microfrontends.map(mfe => (
                            <MicrofrontendCard key={mfe._id} mfe={mfe} />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <p className="text-muted-foreground mb-4">{t("microfrontend.noMicrofrontendsFound")}</p>
                        <Button variant="secondary" onClick={onResetFilters}>
                            {t("common.resetFilters")}
                        </Button>
                    </div>
                )}
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
                            {microfrontends?.map(mfe => {
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
                            })}
                        </TableBody>
                    </Table>
                </div>
            </TabsContent>
        </Tabs>
    )
}

const MicrofrontendList: React.FC<MicrofrontendListProps> = ({ searchTerm, projectId, onResetFilters, setTabsValue }) => {
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
            {microfrontendListQuery?.data?.length !== 0 ? (
                <MicrofrontendListReal microfrontends={microfrontendListReal} onResetFilters={onResetFilters} setTabsValue={setTabsValue} />
            ) : (
                <NoMicrofrontendPlaceholder projectId={projectId} />
            )}
        </ApiDataFetcher>
    )
}

export default MicrofrontendList
