import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TextField from '@/components/input/TextField.rhf';
import SelectField from '@/components/input/SelectField.rhf';
import useStorageApi, { 
  Storage, 
  CreateStorageDTO, 
  StorageType
} from '@/hooks/apiClients/useStorageApi';
import { useQuery } from '@tanstack/react-query';
import SinglePageHeader from '@/components/SinglePageHeader';
import { FormProvider } from 'react-hook-form';

const storageTypes = [
  { value: StorageType.AWS, label: 'Amazon S3' },
  { value: StorageType.GOOGLE, label: 'Google Cloud Storage' },
  { value: StorageType.AZURE, label: 'Azure Blob Storage' }
];

const googleAuthTypes = [
  { value: 'serviceAccount', label: 'Service Account' },
  { value: 'apiKey', label: 'API Key' },
  { value: 'default', label: 'Default' }
];

const azureAuthTypes = [
  { value: 'connectionString', label: 'Connection String' },
  { value: 'sharedKey', label: 'Shared Key' },
  { value: 'aad', label: 'Azure AD' }
];

const NewOrEditStoragePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const storageApi = useStorageApi();

  const form = useForm<CreateStorageDTO>({
    defaultValues: {
      name: '',
      type: StorageType.AWS,
      authConfig: {
        accessKeyId: '',
        secretAccessKey: '',
        bucketName: '',
        region: 'us-east-1',
      },
    },
  });

  const { data: storage, isLoading } = useQuery<Storage>({
    queryKey: ['storage', id],
    queryFn: () => storageApi.getSingle(id!),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (storage && isEditMode) {
      form.reset(storage as unknown as CreateStorageDTO);
    }
  }, [storage, isEditMode, form]);

  const onSubmit = async (data: CreateStorageDTO) => {
    try {
      if (isEditMode && id) {
        await storageApi.update(id, data);
      } else {
        await storageApi.create(data);
      }
      navigate('/storages');
    } catch (error) {
      console.error('Error saving storage:', error);
    }
  };

  const renderAuthFields = () => {
    const storageType = form.watch('type');
    
    switch (storageType) {
      case StorageType.AWS:
        return (
          <>
            <TextField
              name="authConfig.accessKeyId"
              label="Access Key ID"
              rules={{ required: t('validation.required') }}
            />
            <TextField
              name="authConfig.secretAccessKey"
              label="Secret Access Key"
              type="password"
              rules={{ required: t('validation.required') }}
            />
            <TextField
              name="authConfig.region"
              label="Region"
              rules={{ required: t('validation.required') }}
            />
            <TextField
              name="authConfig.bucketName"
              label="Bucket Name"
              rules={{ required: t('validation.required') }}
            />
          </>
        );

      case StorageType.GOOGLE:
        const googleAuthType = form.watch('authConfig.authType');
        
        return (
          <>
            <SelectField
              name="authConfig.authType"
              label="Authentication Type"
              options={googleAuthTypes}
              rules={{ required: t('validation.required') }}
            />

            <TextField
              name="authConfig.projectId"
              label="Project ID"
              rules={{ required: t('validation.required') }}
            />

            <TextField
              name="authConfig.bucketName"
              label="Bucket Name"
              rules={{ required: t('validation.required') }}
            />

            {googleAuthType === 'serviceAccount' && (
              <>
                <TextField
                  name="authConfig.credentials.client_email"
                  label="Client Email"
                  rules={{ required: true }}
                />
                <TextField
                  name="authConfig.credentials.private_key"
                  label="Private Key"
                  type="password"
                  rules={{ required: true }}
                />
              </>
            )}

            {googleAuthType === 'apiKey' && (
              <TextField
                name="authConfig.apiKey"
                label="API Key"
                type="password"
                rules={{ required: true }}
              />
            )}
          </>
        );

      case StorageType.AZURE:
        const azureAuthType = form.watch('authConfig.authType');
        
        return (
          <>
            <SelectField
              name="authConfig.authType"
              label="Authentication Type"
              options={azureAuthTypes}
              rules={{ required: t('validation.required') }}
            />

            <TextField
              name="authConfig.containerName"
              label="Container Name"
              rules={{ required: t('validation.required') }}
            />

            {azureAuthType === 'connectionString' && (
              <TextField
                name="authConfig.connectionString"
                label="Connection String"
                type="password"
                rules={{ required: true }}
              />
            )}

            {(azureAuthType === 'sharedKey' || azureAuthType === 'aad') && (
              <TextField
                name="authConfig.accountName"
                label="Account Name"
                rules={{ required: true }}
              />
            )}

            {azureAuthType === 'sharedKey' && (
              <TextField
                name="authConfig.accountKey"
                label="Account Key"
                type="password"
                rules={{ required: true }}
              />
            )}

            {azureAuthType === 'aad' && (
              <>
                <TextField
                  name="authConfig.tenantId"
                  label="Tenant ID"
                  rules={{ required: true }}
                />
                <TextField
                  name="authConfig.clientId"
                  label="Client ID"
                  rules={{ required: true }}
                />
                <TextField
                  name="authConfig.clientSecret"
                  label="Client Secret"
                  type="password"
                  rules={{ required: true }}
                />
              </>
            )}
          </>
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <SinglePageHeader
        title={isEditMode ? t('storage.editStorage') : t('storage.newStorage')}
        description={
          isEditMode 
            ? t('storage.editStorageDescription', 'Edit your storage configuration')
            : t('storage.newStorageDescription', 'Create a new storage configuration')
        }
      />

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <TextField
                name="name"
                label={t('storage.name')}
                rules={{ required: t('validation.required') }}
              />

              <SelectField
                name="type"
                label={t('storage.type')}
                options={storageTypes}
                rules={{ required: t('validation.required') }}
              />

              {renderAuthFields()}

              <div className="flex justify-end space-x-4 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/storages')}
                >
                  {t('common.cancel')}
                </Button>
                <Button type="submit">
                  {isEditMode ? t('common.update') : t('common.create')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </FormProvider>
    </div>
  );
};

export default NewOrEditStoragePage;