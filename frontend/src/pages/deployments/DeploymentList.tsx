import { useTranslation } from 'react-i18next';
import { PackageOpen, Upload } from 'lucide-react';
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Users } from 'lucide-react';
import useDeploymentsApi from '../../hooks/apiClients/useDeploymentsApi';
import { useMutation, useQuery } from '@tanstack/react-query';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import { useState } from 'react';
import { Link } from 'react-router-dom';

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
                    <CardContent className="px-6 pb-4">
                        {deployments.length > 0 ?
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
                                    {deployments.map(deployment => (
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
                                            <TableCell className="flex items-center space-x-2">
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
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                asChild
                                                            >
                                                                <Link to={`/deployments/${deployment._id}/canary-users`}>
                                                                    <Users className="h-4 w-4" />
                                                                </Link>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p>{t("deployments.actions.view_canary_users")}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                    }
                                </TableBody>
                            </Table>
                            :
                            <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                <PackageOpen className="h-12 w-12 text-muted-foreground" />
                                <div className="text-center space-y-2">
                                    <h3 className="text-lg font-medium">{t("deployments.no_deployments")}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {t("deployments.no_deployments_description")}
                                    </p>
                                </div>
                                <Button>
                                    <Upload className="mr-2 h-4 w-4" />
                                    {t("deployments.deploy_now")}
                                </Button>
                            </div>
                        }
                    </CardContent>
                </Card>
                {selectedDeployment && (
                    <Card className="flex-1">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-lg font-semibold">{t("deployments.microfrontends_title")}</CardTitle>
                        </CardHeader>
                        <CardContent className="px-6 pb-4">
                            {selectedDeployment.microfrontends.length > 0 &&
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("deployments.columns.microfrontend")}</TableHead>
                                        <TableHead>{t("deployments.columns.version")}</TableHead>
                                        <TableHead>{t("deployments.columns.slug")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {
                                        selectedDeployment.microfrontends.map(singleMicrofrontend => (
                                            <TableRow key={singleMicrofrontend._id}>
                                                <TableCell className="font-medium">{singleMicrofrontend.name}</TableCell>
                                                <TableCell>
                                                    <Badge className="font-mono">{singleMicrofrontend.version}</Badge>
                                                </TableCell>
                                                <TableCell>{singleMicrofrontend.slug}</TableCell>
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                            }   
                            {selectedDeployment.variables.length > 0 &&
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("deployments.columns.variable")}</TableHead>
                                        <TableHead>{t("deployments.columns.value")}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {
                                        selectedDeployment.variables.map(singleVariable => (
                                            <TableRow key={singleVariable._id}>
                                                <TableCell className="font-medium">{singleVariable.key}</TableCell>
                                                <TableCell>{singleVariable.value}</TableCell>
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                            }
                        </CardContent>
                    </Card>
                )}
            </div>
        </ApiDataFetcher>
    )
};

export default DeploymentList;
