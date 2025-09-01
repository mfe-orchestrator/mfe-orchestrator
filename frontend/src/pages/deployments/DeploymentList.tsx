import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import useDeploymentsApi from '../../hooks/apiClients/useDeploymentsApi';
import { useMutation, useQuery } from '@tanstack/react-query';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import { useState } from 'react';

interface DeploymentListProps {
    environmentId: string;
}

const DeploymentList: React.FC<DeploymentListProps> = ({ environmentId }) => {
    const { t } = useTranslation('platform');
    const { getDeployments, redeploy } = useDeploymentsApi();
    const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);

    const dataQuery = useQuery({
        queryKey: ['deployments', environmentId],
        queryFn: () => getDeployments(environmentId),
    });

    const redeployQuery = useMutation({
        mutationFn: redeploy,
        onSuccess: () => dataQuery.refetch()
    })

    const onRedeploy = (deploymentId: string) => {
        redeployQuery.mutate(deploymentId)
    }

    const deployments = dataQuery.data || [];

    const selectedDeployment = deployments.find(deployment => deployment._id === selectedDeploymentId);

    return (
        <ApiDataFetcher queries={[dataQuery]}>
            <div className="flex flex-row gap-4">
                <Card className="flex-1">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-lg font-semibold">{t("deployments.title")}</CardTitle>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => dataQuery.refetch()}>
                                        <RefreshCw className={`h-4 w-4 ${dataQuery.isRefetching ? "animate-spin" : ""}`} />
                                        <span className="sr-only">{t("deployments.refresh")}</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{t("deployments.refresh")}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </CardHeader>
                    <CardContent className="px-6 pb-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t("deployments.columns.id")}</TableHead>
                                    <TableHead>{t("deployments.columns.created")}</TableHead>
                                    <TableHead>{t("deployments.columns.deployed")}</TableHead>
                                    <TableHead className="w-32">{t("deployments.columns.actions")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {deployments.length > 0 ? (
                                    deployments.map(deployment => (
                                        <TableRow key={deployment._id} onClick={() => setSelectedDeploymentId(deployment._id)}>
                                            <TableCell>
                                                {deployment.deploymentId}
                                                {deployment.active && <Badge className="ml-2">{t("deployments.active")}</Badge>}
                                            </TableCell>
                                            <TableCell>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="text-sm text-muted-foreground cursor-help">{new Date(deployment.createdAt).toLocaleDateString()}</span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{new Date(deployment.createdAt).toLocaleString()}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                            <TableCell>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="text-sm text-muted-foreground cursor-help">{new Date(deployment.deployedAt).toLocaleDateString()}</span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{new Date(deployment.deployedAt).toLocaleString()}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                            <TableCell>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={e => {
                                                                    e.stopPropagation()
                                                                    onRedeploy(deployment._id)
                                                                }}
                                                                disabled={redeployQuery.isPending || deployment.active}
                                                            >
                                                                <RefreshCw className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{t("deployments.actions.redeploy_tooltip")}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-2">
                                                <p className="text-sm font-medium">{t("deployments.no_deployments")}</p>
                                                <p className="text-sm text-muted-foreground">{t("deployments.no_deployments_description")}</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
                {selectedDeployment && (
                    <Card className="flex-1">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-semibold">{t("deployments.microfrontends_title")}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-6 pb-4">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("deployments.columns.microfrontend")}</TableHead>
                                        <TableHead>{t("deployments.columns.version")}</TableHead>
                                        <TableHead>{t("deployments.columns.slug")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedDeployment.microfrontends.length > 0 ? (
                                        selectedDeployment.microfrontends.map(singleMicrofrontend => (
                                            <TableRow key={singleMicrofrontend._id}>
                                                <TableCell className="font-medium">{singleMicrofrontend.name}</TableCell>
                                                <TableCell>
                                                    <Badge className="font-mono">{singleMicrofrontend.version}</Badge>
                                                </TableCell>
                                                <TableCell>{singleMicrofrontend.slug}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <div className="flex flex-col items-center justify-center space-y-2">
                                                    <p className="text-sm font-medium">{t("deployments.no_deployments")}</p>
                                                    <p className="text-sm text-muted-foreground">{t("deployments.no_deployments_description")}</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </div>
        </ApiDataFetcher>
    )
};

export default DeploymentList;
