import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import { Badge } from "@/components/ui/badge/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

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
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-primary/25 hover:bg-primary/25">
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Slug</TableHead>
                                    <TableHead>Versione</TableHead>
                                    <TableHead>Canary release</TableHead>
                                    <TableHead className="w-[100px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {microfrontends?.map((mfe) => {
                                    const canaryPercentage: number = mfe.canary?.percentage || 0
                                    return (
                                        <TableRow key={mfe._id} className="hover:bg-primary/10">
                                            <TableCell className="font-medium">{mfe.name}</TableCell>
                                            <TableCell>{mfe.slug}</TableCell>
                                            <TableCell>
                                                <Badge>{mfe.version}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                {canaryPercentage > 0 ? (
                                                    <span>{canaryPercentage}% degli utenti</span>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button 
                                                    variant="primary" 
                                                    size="sm" 
                                                    onClick={() => navigate(`/microfronted/${mfe._id}`)}
                                                    className="w-full"
                                                >
                                                    Configurazione
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
