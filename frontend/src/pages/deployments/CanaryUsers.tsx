import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from "@/components/ui/badge/badge"
import { CanaryUser } from '@/hooks/apiClients/useDeploymentsApi';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useCanaryUsersApi from '@/hooks/apiClients/useCanaryUsersApi';
import SinglePageLayout from '@/components/SinglePageLayout';
import { DotLottieReact } from "@lottiefiles/dotlottie-react"

const CanaryUsers: React.FC = () => {
    const { t } = useTranslation()
    const { deploymentId } = useParams<{ deploymentId: string }>()
    const canaryUsersApi = useCanaryUsersApi()

    const query: UseQueryResult<CanaryUser[]> = useQuery({
        queryKey: ["canaryUsers", deploymentId],
        queryFn: () => canaryUsersApi.getCanaryUsers(deploymentId!),
        enabled: !!deploymentId
    })

    return (
        <ApiDataFetcher queries={[query]}>
            <SinglePageLayout title={t("deployments.canary_users.title")} description={t("deployments.canary_users.subtitle")} headerClassName="opacity-50">
                {/* <Card>
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
                </Card> */}
                <div className="flex flex-col items-center justify-center w-full p-4 grow">
                    <p className="text-foreground-secondary text-center text-xl font-semibold tracking-normal uppercase -mb-2">Coming soon</p>
                    <DotLottieReact src="https://lottie.host/732448e9-9883-4798-81f3-aa1448f0c9bb/6MBCLiRSDA.json" loop autoplay className="max-w-[400px] max-h-[400px] w-full aspect-square" />
                </div>
            </SinglePageLayout>
        </ApiDataFetcher>
    )
}

export default CanaryUsers;
