import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import useProjectStore from '@/store/useProjectStore';
import useStorageApi from '@/hooks/apiClients/useStorageApi';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import SinglePageHeader from '@/components/SinglePageHeader';

const StoragesPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projectStore = useProjectStore();
  const storagesApi = useStorageApi();
  
  const storagesQuery = useQuery({
    queryKey: ['storages', projectStore.project?._id],
    queryFn: () => storagesApi.getMultiple(projectStore.project?._id),
  })
  
  const handleEdit = (id: string) => {
    navigate(`/storages/${id}`);
  };

  const handleCreate = () => {
    navigate('/storages/new');
  };

  const handleDelete = async (id: string) => {
    await storagesApi.deleteSingle(id);
    storagesQuery.refetch();
  };

  return (
    <ApiDataFetcher queries={[storagesQuery]}>
      <SinglePageHeader
        title={t('storage.storages')}
        description={t('storage.storagesDescription')}
        buttons={
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('storage.newStorage')}
          </Button>
        }
      />

      <Card className="mt-6">
        <CardContent className="p-4">
            <div className="space-y-4">
              {storagesQuery.data && storagesQuery.data?.length > 0 ? (
                storagesQuery.data?.map((storage) => (
                  <div key={storage._id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h3 className="font-medium">{storage.name}</h3>
                      <Badge variant="outline" className="mt-1">
                        {storage.type}
                      </Badge>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(storage._id)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(storage._id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  {t('storage.noStoragesFound')}
                </div>
              )}
            </div>
        </CardContent>
      </Card>
    </ApiDataFetcher>
  );
};

export default StoragesPage;
