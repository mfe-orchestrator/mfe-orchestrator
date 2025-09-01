import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge/badge"
import { ArrowLeft } from 'lucide-react';
import useDeploymentsApi, { CanaryUser } from '@/hooks/apiClients/useDeploymentsApi';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useCanaryUsersApi from '@/hooks/apiClients/useCanaryUsersApi';
import SinglePageHeader from '@/components/SinglePageHeader';

const CanaryUsers: React.FC = () => {
    const { t } = useTranslation();
    const { deploymentId } = useParams<{ deploymentId: string }>();
    const navigate = useNavigate();
    const canaryUsersApi = useCanaryUsersApi();

    const query: UseQueryResult<CanaryUser[]> = useQuery({
        queryKey: ['canaryUsers', deploymentId],
        queryFn: () => canaryUsersApi.getCanaryUsers(deploymentId!),
        enabled: !!deploymentId
    });


    return (
        <ApiDataFetcher queries={[query]}>
            <SinglePageHeader 
                title={t('deployments.canary_users.title')} 
                description={t('deployments.canary_users.subtitle')}
            />
        <div className="space-y-6">
            <Card>
                <CardContent>
                    <ApiDataFetcher queries={[query]}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{t('deployments.canary_users.columns.user')}</TableHead>
                                    <TableHead>{t('deployments.canary_users.columns.email')}</TableHead>
                                    <TableHead>{t('deployments.canary_users.columns.status')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {query.data?.length ? (
                                    query.data.map((user: any) => (
                                        <TableRow key={user._id}>
                                            <TableCell className="font-medium">
                                                {user.name} {user.surname}
                                            </TableCell>
                                            <TableCell>{user.email}</TableCell>
                                            <TableCell>
                                                <Badge>
                                                    {user.isActive 
                                                        ? t('deployments.canary_users.active') 
                                                        : t('deployments.canary_users.inactive')}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">
                                            {t('deployments.canary_users.no_users')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </ApiDataFetcher>
                </CardContent>
            </Card>
        </div>
        </ApiDataFetcher>
    );
};

export default CanaryUsers;
