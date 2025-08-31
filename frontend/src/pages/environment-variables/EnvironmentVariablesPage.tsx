import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useToastNotificationStore from '@/store/useToastNotificationStore';
import EnvironmentsGate from '@/theme/EnvironmentsGate';
import useProjectStore from '@/store/useProjectStore';
import useGlobalVariablesApi from '@/hooks/apiClients/useGlobalVariablesApi';
import SinglePageHeader from '@/components/SinglePageHeader';


export interface EnvironmentVariable {
    key: string;
    value: string;
    environmentId: string;
}

const EnvironmentVariablesPageInner: React.FC = () => {
    const { t } = useTranslation();
    const { project, environments } = useProjectStore();
    const notifications = useToastNotificationStore();
    const globalVariablesApi = useGlobalVariablesApi();

    // Fetch variables for each environment
    const variablesQuery = useQuery({
        queryKey: ['global-variables', project?._id],
        queryFn: () => globalVariablesApi.getGlobalVariablesByProjectId(project?._id),
        enabled: !!project?._id
    });

    return (
        <ApiDataFetcher queries={[variablesQuery]}
        >
            <SinglePageHeader
                title={t('environmentVariables.title')}
            />
            <Card className='mt-6'>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableCell className="font-medium">
                                    {t('environmentVariables.variable')}
                                </TableCell>
                                {environments.map((env) => (
                                    <TableCell key={env._id} style={{ minWidth: '200px' }}>
                                        {env.name}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {variablesQuery.data?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={environments.length + 1} align="center">
                                        {t('environmentVariables.noVariables')}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                variablesQuery.data?.map((key) => (
                                    <TableRow key={key.key} className="hover:bg-muted/50">
                                        <TableCell className="font-medium">
                                            <code>{key.key}</code>
                                        </TableCell>
                                        {environments.map(env => {
                                            //const envVars = variables[env._id] || [];
                                            //const varValue = envVars.find((v) => v.key === key)?.value || '';
                                            const varValue = "xx"
                                            return (
                                                <TableCell key={`${env._id}-${key}`}>
                                                    <code>{varValue}</code>
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </ApiDataFetcher>
    );
};


const EnvironmentVariablesPage = () => {
    return (
        <EnvironmentsGate>
            <EnvironmentVariablesPageInner />
        </EnvironmentsGate>
    )
}
export default EnvironmentVariablesPage;
