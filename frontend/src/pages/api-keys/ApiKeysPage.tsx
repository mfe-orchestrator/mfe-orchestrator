import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button/button"
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DeleteConfirmationDialog } from '@/components/ui/DeleteConfirmationDialog';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useApiKeysApi from '@/hooks/apiClients/useApiKeysApi';
import { format } from 'date-fns';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import useProjectStore from '@/store/useProjectStore';
import CreateApiKeyDialog from '@/components/ApiKeys/CreateApiKeyDialog';
import SinglePageLayout from '@/components/SinglePageLayout';
import NoApiKeyPlaceholder from '@/components/ApiKeys/NoApiKeyPlaceholder';
import useThemeStore from '@/store/useThemeStore';

const ApiKeysPage = () => {
  const { t } = useTranslation();
  const apiKeysApi = useApiKeysApi();
  const queryClient = useQueryClient();
  const project = useProjectStore();
  const themeStore = useThemeStore();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<{ id: string, name: string } | null>(null);


  const apiKeysQuery = useQuery({
    queryKey: ['api-keys', project.project?._id],
    queryFn: () => apiKeysApi.getApiKeys(project.project?._id || ''),
  });


  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: apiKeysApi.deleteApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', project.project?._id] });
    },
  });

  const formatExpirationDate = (dateString: string) => {
    if (!dateString) return ''
    return format(new Date(dateString), 'PPP', { locale: themeStore.getLocale() });
  };

  return (
    <>
      <ApiDataFetcher queries={[apiKeysQuery]}>
        <SinglePageLayout
          title={t('apiKeys.api_keys')}
          description={t('apiKeys.manage_api_keys')}
          right={apiKeysQuery.data?.length === 0 ? null :
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('apiKeys.create_api_key')}
            </Button>
          }
        >
          <Card>
            <CardContent>
              {apiKeysQuery.data?.length === 0 ?
                <NoApiKeyPlaceholder />
                :
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
                              setKeyToDelete({ id: key._id, name: key.name });
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }

            </CardContent>
          </Card>
        </SinglePageLayout>
      </ApiDataFetcher>
      <CreateApiKeyDialog isCreateDialogOpen={isCreateDialogOpen} setIsCreateDialogOpen={setIsCreateDialogOpen} />
      <DeleteConfirmationDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onDelete={async () => {
          if (keyToDelete) {
            await deleteApiKeyMutation.mutateAsync(keyToDelete.id);
          }
        }}
        onDeleteSuccess={() => {
          setKeyToDelete(null);
        }}
        title={t('apiKeys.key_deleted')}
        description={keyToDelete ? t('apiKeys.confirm_delete', { name: keyToDelete.name }) : ''}
      />
    </>
  );
};

export default ApiKeysPage;
