
import React, { useMemo, useState } from 'react';
import MicrofrontendCard from '../../components/microfrontend/MicrofrontendCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Percent, Settings } from 'lucide-react';
import EnvironmentVariables from '../../components/environment/EnvironmentVariables';
import { useQuery } from '@tanstack/react-query';
import useProjectStore from '@/store/useProjectStore';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useMicrofrontendsApi, { Microfrontend } from '@/hooks/apiClients/useMicrofrontendsApi';
import NoMicrofrontendPlaceholder from './NoMicrofrontendPlaceholder';
import { useNavigate } from 'react-router-dom';
import AddNewMicrofrontendCard from './AddNewMicrofrontendCard';

interface MicrofrontendListProps {
    searchTerm?: string;
    statusFilter?: string;
    environmentId?: string;
    onResetFilters: () => void;
}

interface MicrofrontendListRealProps {
    microfrontends: Microfrontend[];
    onResetFilters: () => void;
}

const MicrofrontendListReal: React.FC<MicrofrontendListRealProps> = ({ microfrontends, onResetFilters }) => {

    const projectStore = useProjectStore();
    const navigate = useNavigate();

    const onAddNewMicrofrontend = () => {
        navigate(`/microfronted/new`);
    }

    return <><div className="flex justify-between items-center">
        <EnvironmentVariables environment={projectStore.environment} />
        <Button variant="outline">Aggiungi Microfrontend</Button>
    </div>
        <Tabs defaultValue="grid" className="space-y-4">
            <div className="flex items-center">
                <TabsList>
                    <TabsTrigger value="grid">Griglia</TabsTrigger>
                    <TabsTrigger value="list">Lista</TabsTrigger>
                </TabsList>
            </div>

            <TabsContent value="grid" className="space-y-4">
                {microfrontends.length > 0 ? (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {microfrontends.map((mfe) => (
                            <MicrofrontendCard key={mfe.id} mfe={mfe} />
                        ))}
                        <AddNewMicrofrontendCard onAddNewMicrofrontend={onAddNewMicrofrontend} />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <p className="text-muted-foreground mb-4">Nessun microfrontend trovato</p>
                        <Button variant="outline" onClick={onResetFilters}>
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
                                    <th className="h-12 px-4 text-left align-middle font-medium">Versione</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium hidden md:table-cell">Descrizione</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium">Stato</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium">Canary</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium">Env Vars</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium">Ambiente</th>
                                    <th className="h-12 px-4 text-left align-middle font-medium">Azioni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {microfrontends.map((mfe) => {

                                    const version = mfe.version;
                                    const canaryPercentage: number = 234
                                    const environmentVariables = {};
                                    const envVarsCount = environmentVariables && Object.keys(environmentVariables).length;

                                    return (
                                        <tr key={mfe.id} className="border-b transition-colors hover:bg-muted/50">
                                            <td className="p-4 align-middle font-medium">{mfe.name}</td>
                                            <td className="p-4 align-middle">{mfe.version}</td>
                                            <td className="p-4 align-middle hidden md:table-cell">
                                                <div className="line-clamp-1">{mfe.description}</div>
                                            </td>
                                            <td className="p-4 align-middle">
                                                <Badge
                                                    variant="outline"
                                                    className={`
                        ${mfe.status === 'active' ? 'bg-green-500' :
                                                            mfe.status === 'inactive' ? 'bg-yellow-500' : 'bg-red-500'} 
                        text-white
                      `}
                                                >
                                                    {mfe.status === 'active' ? 'Attivo' :
                                                        mfe.status === 'inactive' ? 'Inattivo' : 'Errore'}
                                                </Badge>
                                            </td>
                                            <td className="p-4 align-middle">
                                                {canaryPercentage > 0 ? (
                                                    <Badge variant="outline" className="bg-orange-100 text-orange-800 flex items-center gap-1 whitespace-nowrap">
                                                        <Percent className="h-3 w-3" /> {canaryPercentage}%
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle">
                                                {envVarsCount > 0 ? (
                                                    <Badge variant="outline" className="bg-blue-100 text-blue-800 flex items-center gap-1 whitespace-nowrap">
                                                        <Settings className="h-3 w-3" /> {envVarsCount}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground text-xs">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 align-middle">
                                                <Button variant="outline" size="sm">Configurazione</Button>
                                            </td>
                                        </tr>
                                    )
                                })}

                                {microfrontends.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="h-24 text-center text-muted-foreground">
                                            Nessun microfrontend trovato
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </TabsContent>
        </Tabs></>

}

const MicrofrontendList: React.FC<MicrofrontendListProps> = ({ searchTerm, statusFilter, environmentId, onResetFilters }) => {


    const microfrontendsApi = useMicrofrontendsApi();

    const microfrontendListQuery = useQuery({
        queryKey: ['microfrontends', environmentId],
        queryFn: () => microfrontendsApi.getByEnvironmentId(environmentId),
        enabled: !!environmentId
    })

    const microfrontendListReal = useMemo(() => {
        const data = microfrontendListQuery?.data;
        if (!data) {
            return null;
        }

        if (!searchTerm && !statusFilter) return data;

        const filteredData = data.filter((mfe) => {
            const nameMatch = searchTerm ? mfe.name.toLowerCase().includes(searchTerm.toLowerCase()) : true
            const statusMatch = statusFilter && statusFilter !== 'all' ? mfe.status === statusFilter : true;
            return nameMatch && statusMatch;
        });

        return filteredData;

    }, [microfrontendListQuery?.data, searchTerm, statusFilter])

    return <ApiDataFetcher queries={[microfrontendListQuery]}>
        {microfrontendListQuery?.data?.length === 0 ?
            <NoMicrofrontendPlaceholder environmentId={environmentId} />
            :
            <MicrofrontendListReal microfrontends={microfrontendListReal} onResetFilters={onResetFilters} />
        }

    </ApiDataFetcher>
}

export default MicrofrontendList;