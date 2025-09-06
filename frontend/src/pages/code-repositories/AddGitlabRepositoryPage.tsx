import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, ExternalLink, Eye, EyeOff, Info } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import useCodeRepositoriesApi, { GitlabProject } from '@/hooks/apiClients/useCodeRepositoriesApi';
import SinglePageLayout from '@/components/SinglePageLayout';
import { FormProvider, useForm } from 'react-hook-form';
import TextField from '@/components/input/TextField.rhf';

interface AddGitlabFormValues {
    url: string
    pat: string
}

const AddGitlabRepositoryPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showPat, setShowPat] = useState(false);
  const [error, setError] = useState('');
  const repositoryApi = useCodeRepositoriesApi();
  const params = useParams<{ id: string }>();

  const addRepositoryMutation = useMutation({
    mutationFn: repositoryApi.addRepositoryGitlab,
    onSuccess: () => {
      navigate('/code-repositories');
    },
    onError: (error: unknown) => {
      setError((error as Error)?.message || t('codeRepositories.gitlab.error.failedToAdd'));
    }
  });

  const getRepositoryQuery = useQuery({
    queryKey: ['getRepository', params.id],
    queryFn: async () => {
      const data = await repositoryApi.getRepositoryById(params.id);
      form.setValue('url', data.name);
      form.setValue('pat', data.accessToken);

      return data;
    },
    enabled: !!params.id,
  });

  const testConnectionMutation = useMutation({
    mutationFn: repositoryApi.testConnectionGitlab
  });

  const handleSubmit = async (values : AddGitlabFormValues) => {
    await addRepositoryMutation.mutateAsync(values);
  };

  const requiredScopes = [
    {
      scope: t('codeRepositories.gitlab.scopes.api.name'),
      description: t('codeRepositories.gitlab.scopes.api.description')
    },
    {
      scope: t('codeRepositories.gitlab.scopes.read_user.name'),
      description: t('codeRepositories.gitlab.scopes.read_user.description')
    },
    {
      scope: t('codeRepositories.gitlab.scopes.read_repository.name'),
      description: t('codeRepositories.gitlab.scopes.read_repository.description')
    }
  ];

  const form = useForm<AddGitlabFormValues>({
    defaultValues: {
      url: 'https://gitlab.com'
    }
  });

  return (
    <SinglePageLayout
      title={t('codeRepositories.gitlab.title')}
      description={t('codeRepositories.gitlab.description')}
    >
      <div className="container mx-auto py-6 max-w-4xl">
        <div className="grid gap-6 md:grid-cols-2">
          <FormProvider {...form}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-orange-600 rounded flex items-center justify-center">
                    <span className="text-white text-xs font-bold">GL</span>
                  </div>
                  {t('codeRepositories.gitlab.connection')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <TextField
                      name="url"
                      label={t('codeRepositories.gitlab.gitlabUrl')}
                      placeholder={t('codeRepositories.gitlab.gitlabUrlPlaceholder')}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      {t('codeRepositories.gitlab.gitlabUrlHelp')}
                    </p>
                  </div>

                  <div className="space-y-2">

                    <div className="relative">
                      <TextField
                        name="pat"
                        label={t('codeRepositories.gitlab.pat')}
                        type={showPat ? "text" : "password"}
                        placeholder={t('codeRepositories.gitlab.patPlaceholder')}
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
                      {t('codeRepositories.gitlab.patHelp')}
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
                    {t('codeRepositories.gitlab.testConnection')}
                  </Button>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!testConnectionMutation.data || addRepositoryMutation.isPending || testConnectionMutation.isPending}
                  >
                    {addRepositoryMutation.isPending ? t('codeRepositories.gitlab.connecting') : t('codeRepositories.gitlab.connect')}
                  </Button>
                </form>
              </CardContent>
              {testConnectionMutation.data && (
                <CardContent className="pt-4 border-t mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <p className="text-sm font-medium text-green-600">{t('codeRepositories.gitlab.connectionSuccess')}</p>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t('codeRepositories.gitlab.projectsFound', { count: testConnectionMutation.data.length })}:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {testConnectionMutation.data.map((project: GitlabProject) => (
                      <span 
                        key={project.id}
                        className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-md"
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
                  {t('codeRepositories.gitlab.howToCreate')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-medium">
                      1
                    </div>
                    <div>
                      <p className="font-medium">{t('codeRepositories.gitlab.steps.step1.title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('codeRepositories.gitlab.steps.step1.description')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-medium">
                      2
                    </div>
                    <div>
                      <p className="font-medium">{t('codeRepositories.gitlab.steps.step2.title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('codeRepositories.gitlab.steps.step2.description')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-6 w-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-medium">
                      3
                    </div>
                    <div>
                      <p className="font-medium">{t('codeRepositories.gitlab.steps.step3.title')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('codeRepositories.gitlab.steps.step3.description')}
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
                    href={form.watch('url') || 'https://gitlab.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                  >
                    {t('codeRepositories.gitlab.openGitlab')}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('codeRepositories.gitlab.requiredScopes')}</CardTitle>
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
                    {t('codeRepositories.gitlab.scopesWarning')}
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

export default AddGitlabRepositoryPage;