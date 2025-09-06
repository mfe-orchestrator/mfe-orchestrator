import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Info } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import useCodeRepositoriesApi from '@/hooks/apiClients/useCodeRepositoriesApi';
import SinglePageLayout from '@/components/SinglePageLayout';
import { FormProvider, useForm } from 'react-hook-form';
import TextField from '@/components/input/TextField.rhf';

interface AddAzureFormValues {
    organization: string
    pat: string
}

const AddAzureRepositoryPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showPat, setShowPat] = useState(false);
  const [error, setError] = useState('');
  const repositoryApi = useCodeRepositoriesApi();

  const addRepositoryMutation = useMutation({
    mutationFn: repositoryApi.addRepositoryAzure,
    onSuccess: () => {
      navigate('/code-repositories');
    },
    onError: (error: unknown) => {
      setError((error as Error)?.message || t('codeRepositories.azure.error.failedToAdd'));
    }
  });

  const testConnectionMutation = useMutation({
    mutationFn: repositoryApi.testConnectionAzure
  });

  const handleSubmit = async (values : AddAzureFormValues) => {
    await addRepositoryMutation.mutateAsync(values);
  };

  const requiredScopes = [
    {
      scope: t('codeRepositories.azure.scopes.code.name'),
      description: t('codeRepositories.azure.scopes.code.description')
    },
    {
      scope: t('codeRepositories.azure.scopes.project.name'),
      description: t('codeRepositories.azure.scopes.project.description')
    },
    {
      scope: t('codeRepositories.azure.scopes.build.name'),
      description: t('codeRepositories.azure.scopes.build.description')
    },
    {
      scope: t('codeRepositories.azure.scopes.release.name'),
      description: t('codeRepositories.azure.scopes.release.description')
    }
  ];

  const form = useForm<AddAzureFormValues>();

  return (
    <SinglePageLayout
      title={t('codeRepositories.azure.title')}
      description={t('codeRepositories.azure.description')}
    >
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="grid gap-6 md:grid-cols-2">
          {/* PAT Form */}
          <FormProvider {...form}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">Az</span>
                  </div>
                  {t('codeRepositories.azure.connection')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <TextField
                      name="organization"
                      label={t('codeRepositories.azure.organizationName')}
                      placeholder={t('codeRepositories.azure.organizationPlaceholder')}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      {t('codeRepositories.azure.organizationHelp')}
                    </p>
                  </div>

                  <div className="space-y-2">

                    <div className="relative">
                      <TextField
                        name="pat"
                        label={t('codeRepositories.azure.pat')}
                        type={showPat ? "text" : "password"}
                        placeholder={t('codeRepositories.azure.patPlaceholder')}
                        required
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPat(!showPat)}
                      >
                        {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('codeRepositories.azure.patHelp')}
                    </p>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="button"
                    variant='secondary'
                    className="w-full"
                    disabled={addRepositoryMutation.isPending || testConnectionMutation.isPending}
                    onClick={() => testConnectionMutation.mutateAsync(form.getValues())}
                  >
                    {t('codeRepositories.azure.testConnection')}
                  </Button>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!testConnectionMutation.data || addRepositoryMutation.isPending || testConnectionMutation.isPending}
                  >
                    {addRepositoryMutation.isPending ? t('codeRepositories.azure.connecting') : t('codeRepositories.azure.connect')}
                  </Button>
                </form>
              </CardContent>
              {testConnectionMutation.data && (
                <CardContent className="pt-4 border-t mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <p className="text-sm font-medium text-green-600">{t('codeRepositories.azure.connectionSuccess')}</p>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t('codeRepositories.azure.projectsFound', { count: testConnectionMutation.data.value.length })}:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {testConnectionMutation.data.value.map((project) => (
                      <span 
                        key={project.name}
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-md"
                      >
                        {project.name}
                      </span>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          </FormProvider>

          {/* Instructions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  {t('codeRepositories.azure.howToCreate')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                      1
                    </div>
                    <div>
                      <p className="font-medium">{t('codeRepositories.azure.steps.step1.title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('codeRepositories.azure.steps.step1.description')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                      2
                    </div>
                    <div>
                      <p className="font-medium">{t('codeRepositories.azure.steps.step2.title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('codeRepositories.azure.steps.step2.description')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                      3
                    </div>
                    <div>
                      <p className="font-medium">{t('codeRepositories.azure.steps.step3.title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('codeRepositories.azure.steps.step3.description')}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  asChild
                  className="w-full"
                >
                  <a
                    href="https://dev.azure.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    {t('codeRepositories.azure.openAzureDevOps')}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('codeRepositories.azure.requiredScopes')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {requiredScopes.map((scope, index) => (
                    <div key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-sm">{scope.scope}</p>
                        <p className="text-xs text-muted-foreground">{scope.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Alert className="mt-4">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {t('codeRepositories.azure.scopesWarning')}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </SinglePageLayout>
  );
};

export default AddAzureRepositoryPage;
