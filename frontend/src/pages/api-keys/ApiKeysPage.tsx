import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useApiKeysApi from '@/hooks/apiClients/useApiKeysApi';
import { format } from 'date-fns';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useProjectStore from '@/store/useProjectStore';
import CreateApiKeyDialog from '@/components/ApiKeys/CreateApiKeyDialog';

const ApiKeysPage = () => {
  const { t } = useTranslation();
  const apiKeysApi = useApiKeysApi();
  const queryClient = useQueryClient();
  const project = useProjectStore();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);


  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', project.project?._id],
    queryFn: ()=>apiKeysApi.getApiKeys(project.project?._id || ''),
  });


  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: apiKeysApi.deleteApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', project.project?._id] });
    },
  });

  const formatExpirationDate = (dateString: string) => {
    if(!dateString) return ''
    return format(new Date(dateString), 'PP');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('apiKeys.api_keys')}</h1>
          <p className="text-muted-foreground">
            {t('apiKeys.manage_api_keys')}
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t('apiKeys.create_api_key')}
        </Button>
      </div>

      <Card>
        <CardContent>
          <ApiDataFetcher queries={[apiKeysQuery]}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('apiKeys.name')}</TableHead>
                  <TableHead>{t('apiKeys.created')}</TableHead>
                  <TableHead>{t('apiKeys.expires')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeysQuery.data?.map((key) => (
                  <TableRow key={key._id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>{formatExpirationDate(key.createdAt)}</TableCell>
                    <TableCell>{formatExpirationDate(key.expiresAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deleteApiKeyMutation.isPending}
                        onClick={() => {
                          if (confirm(t('apiKeys.confirm_delete', { name: key.name }))) {
                            deleteApiKeyMutation.mutate(key._id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ApiDataFetcher>
        </CardContent>
      </Card>

      <CreateApiKeyDialog isCreateDialogOpen={isCreateDialogOpen} setIsCreateDialogOpen={setIsCreateDialogOpen} />
    </div>
  );
};

export default ApiKeysPage;
