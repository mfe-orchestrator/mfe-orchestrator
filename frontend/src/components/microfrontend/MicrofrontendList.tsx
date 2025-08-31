import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button/button"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { useQuery } from "@tanstack/react-query"
import React, { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import MicrofrontendCard from "../../components/microfrontend/MicrofrontendCard"
import { TabsContent } from "../ui/tabs/partials/tabsContent/tabsContent"
import { TabsList } from "../ui/tabs/partials/tabsList/tabsList"
import { TabsTrigger } from "../ui/tabs/partials/tabsTrigger/tabsTrigger"
import { Tabs } from "../ui/tabs/tabs"
import AddNewMicrofrontendCard from "./AddNewMicrofrontendCard"
import NoMicrofrontendPlaceholder from "./NoMicrofrontendPlaceholder"
import { LayoutGrid, StretchHorizontal } from "lucide-react"

interface MicrofrontendListProps {
    searchTerm?: string
    projectId?: string
    onResetFilters: () => void
}

interface MicrofrontendListRealProps {
    microfrontends: Microfrontend[]
    onResetFilters: () => void
}

const MicrofrontendListReal: React.FC<MicrofrontendListRealProps> = ({ microfrontends, onResetFilters }) => {
    const navigate = useNavigate()

    const onAddNewMicrofrontend = () => {
        navigate(`/microfronted/new`)
    }

    return (
        <>
            <div className="flex justify-between items-center">
                <Button variant="secondary">Aggiungi Microfrontend</Button>
            </div>
            <Tabs defaultValue="grid" className="space-y-4" iconButtons>
                <TabsList>
                    <TabsTrigger value="grid">
                        <LayoutGrid />
                    </TabsTrigger>
                    <TabsTrigger value="list">
                        <StretchHorizontal />
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="grid">
                    {microfrontends && microfrontends.length > 0 ? (
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            <AddNewMicrofrontendCard onAddNewMicrofrontend={onAddNewMicrofrontend} />
                            {microfrontends.map(mfe => (
                                <MicrofrontendCard key={mfe._id} mfe={mfe} />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <p className="text-muted-foreground mb-4">Nessun microfrontend trovato</p>
                            <Button variant="secondary" onClick={onResetFilters}>
                                Reimposta filtri
                            </Button>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="list">
                    <div className="rounded-md border">
                        <div className="relative w-full overflow-auto">
                            <table className="w-full caption-bottom text-sm">
                                <thead>
                                    <tr className="border-b transition-colors hover:bg-muted/50">
                                        <th className="h-12 px-4 text-left align-middle font-medium">Nome</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium">Slug</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium hidden md:table-cell">Descrizione</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium">Versione</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium">Canary</th>
                                        <th className="h-12 px-4 text-left align-middle font-medium">Azioni</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {microfrontends?.map(mfe => {
                                        const canaryPercentage: number = 23
                                        return (
                                            <tr key={mfe._id} className="border-b transition-colors hover:bg-muted/50">
                                                <td className="p-4 align-middle font-medium">{mfe.name}</td>
                                                <td className="p-4 align-middle font-medium">{mfe.slug}</td>
                                                <td className="p-4 align-middle hidden md:table-cell">
                                                    <div className="line-clamp-1">{mfe.description}</div>
                                                </td>
                                                <td className="p-4 align-middle">{mfe.version}</td>
                                                <td className="p-4 align-middle">
                                                    {canaryPercentage > 0 ? (
                                                        <Badge variant="outline" className="bg-orange-100 text-orange-800 flex items-center gap-1 whitespace-nowrap">
                                                            {canaryPercentage}%
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </td>
                                                <td className="p-4 align-middle">
                                                    <Button variant="secondary" size="sm">
                                                        Configurazione
                                                    </Button>
                                                </td>
                                            </tr>
                                        )
                                    })}

                                    {!microfrontends ||
                                        (microfrontends.length === 0 && (
                                            <tr>
                                                <td colSpan={8} className="h-24 text-center text-muted-foreground">
                                                    Nessun microfrontend trovato
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </TabsContent>
            </Tabs>
        </>
    )
}

const MicrofrontendList: React.FC<MicrofrontendListProps> = ({ searchTerm, projectId, onResetFilters }) => {
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
                <MicrofrontendListReal microfrontends={microfrontendListReal} onResetFilters={onResetFilters} />
            ) : (
                <NoMicrofrontendPlaceholder projectId={projectId} />
            )}
        </ApiDataFetcher>
    )
}

export default MicrofrontendList
