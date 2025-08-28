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

const NewOrEditStoragePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditMode = Boolean(id);
  const storageApi = useStorageApi();

  const storageTypes = [
    { value: StorageType.AWS, label: t('storage.types.aws') },
    { value: StorageType.GOOGLE, label: t('storage.types.google') },
    { value: StorageType.AZURE, label: t('storage.types.azure') }
  ];

  const googleAuthTypes = [
    { value: 'serviceAccount', label: t('storage.authTypes.google.serviceAccount') },
    { value: 'apiKey', label: t('storage.authTypes.google.apiKey') },
    { value: 'default', label: t('common.default') }
  ];

  const azureAuthTypes = [
    { value: 'connectionString', label: t('storage.authTypes.azure.connectionString') },
    { value: 'sharedKey', label: t('storage.authTypes.azure.sharedKey') },
    { value: 'aad', label: t('storage.authTypes.azure.aad') }
  ];


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
              label={t('storage.fields.accessKeyId')}
              rules={{ required: t('validation.required') }}
            />
            <TextField
              name="authConfig.secretAccessKey"
              label={t('storage.fields.secretAccessKey')}
              type="password"
              rules={{ required: t('validation.required') }}
            />
            <TextField
              name="authConfig.region"
              label={t('storage.fields.region')}
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
              label={t('storage.fields.authType')}
              options={googleAuthTypes}
              rules={{ required: t('validation.required') }}
            />

            <TextField
              name="authConfig.projectId"
              label={t('storage.fields.projectId')}
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
                  label={t('storage.fields.clientEmail')}
                  rules={{ required: true }}
                />
                <TextField
                  name="authConfig.credentials.private_key"
                  label={t('storage.fields.privateKey')}
                  type="password"
                  rules={{ required: true }}
                />
              </>
            )}

            {googleAuthType === 'apiKey' && (
              <TextField
                name="authConfig.apiKey"
                label={t('storage.fields.apiKey')}
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
              label={t('storage.fields.authType')}
              options={azureAuthTypes}
              rules={{ required: t('validation.required') }}
            />

            <TextField
              name="authConfig.containerName"
              label={t('storage.fields.containerName')}
              rules={{ required: t('validation.required') }}
            />

            {azureAuthType === 'connectionString' && (
              <TextField
                name="authConfig.connectionString"
                label={t('storage.fields.connectionString')}
                type="password"
                rules={{ required: true }}
              />
            )}

            {(azureAuthType === 'sharedKey' || azureAuthType === 'aad') && (
              <TextField
                name="authConfig.accountName"
                label={t('storage.fields.accountName')}
                rules={{ required: true }}
              />
            )}

            {azureAuthType === 'sharedKey' && (
              <TextField
                name="authConfig.accountKey"
                label={t('storage.fields.accountKey')}
                type="password"
                rules={{ required: true }}
              />
            )}

            {azureAuthType === 'aad' && (
              <>
                <TextField
                  name="authConfig.tenantId"
                  label={t('storage.fields.tenantId')}
                  rules={{ required: true }}
                />
                <TextField
                  name="authConfig.clientId"
                  label={t('storage.fields.clientId')}
                  rules={{ required: true }}
                />
                <TextField
                  name="authConfig.clientSecret"
                  label={t('storage.fields.clientSecret')}
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
    return <div>{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <SinglePageHeader
        title={isEditMode ? t('storage.editStorage') : t('storage.newStorage')}
        description={
          isEditMode 
            ? t('storage.editStorageDescription')
            : t('storage.newStorageDescription')
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