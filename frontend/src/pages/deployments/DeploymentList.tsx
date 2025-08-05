import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import useDeploymentsApi from '../../hooks/apiClients/useDeploymentsApi';
import { useQuery } from '@tanstack/react-query';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';

interface DeploymentListProps {
    environmentId: string;
}

const DeploymentList: React.FC<DeploymentListProps> = ({ environmentId }) => {
    const { t } = useTranslation('platform');
    const { getDeployments } = useDeploymentsApi();

    const dataQuery = useQuery({
        queryKey: ['deployments', environmentId],
        queryFn: () => getDeployments(environmentId),
    });

    const deployments = dataQuery.data || [];

    const getStatusBadge = (status: string) => {
        const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success', icon: React.ReactNode }> = {
            'completed': {
                variant: 'success',
                icon: <CheckCircle2 className="h-3 w-3 mr-1" />
            },
            'failed': {
                variant: 'destructive',
                icon: <AlertCircle className="h-3 w-3 mr-1" />
            },
            'in-progress': {
                variant: 'default',
                icon: <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            },
            'pending': {
                variant: 'outline',
                icon: <Clock className="h-3 w-3 mr-1" />
            }
        };

        const statusConfig = statusMap[status] || { variant: 'default' as const, icon: null };
        const displayStatus = t(`deployments.status.${status}`, { defaultValue: status });

        return (
            <Badge className="gap-1">
                {statusConfig.icon}
                {displayStatus}
            </Badge>
        );
    };

    return (
        <ApiDataFetcher queries={[dataQuery]}>
        <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-semibold">
                    {t('deployments.title')}
                </CardTitle>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 w-8 p-0"
                                onClick={() => dataQuery.refetch()}
                            >
                                <RefreshCw className={`h-4 w-4 ${dataQuery.isRefetching ? 'animate-spin' : ''}`} />
                                <span className="sr-only">{t('deployments.refresh')}</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{t('deployments.refresh')}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </CardHeader>
            <div className="px-6 pb-4">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('deployments.columns.microfrontend')}</TableHead>
                            <TableHead>{t('deployments.columns.version')}</TableHead>
                            <TableHead>{t('deployments.columns.status')}</TableHead>
                            <TableHead>{t('deployments.columns.created')}</TableHead>
                            <TableHead>{t('deployments.columns.last_updated')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {deployments.length > 0 ? (
                            deployments.map((deployment) => (
                                <TableRow key={deployment._id}>
                                    <TableCell className="font-medium">
                                        {deployment.microfrontendId}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono">
                                            v{deployment.version}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {getStatusBadge(deployment.status)}
                                    </TableCell>
                                    <TableCell>
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span className="text-sm text-muted-foreground cursor-help">
                                                        {new Date(deployment.createdAt).toLocaleDateString()}
                                                    </span>
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
                                                    <span className="text-sm text-muted-foreground cursor-help">
                                                        {new Date(deployment.updatedAt).toLocaleDateString()}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>{new Date(deployment.updatedAt).toLocaleString()}</p>
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
                                        <p className="text-sm font-medium">
                                            {t('deployments.no_deployments')}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                            {t('deployments.no_deployments_description')}
                                        </p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </Card>
        </ApiDataFetcher>
    );
};

export default DeploymentList;
