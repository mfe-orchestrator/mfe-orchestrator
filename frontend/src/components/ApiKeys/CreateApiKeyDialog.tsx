import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ApiKeyFormData, CreateApiKeyFormInner } from './CreateApiKeyForm';
import { useTranslation } from 'react-i18next';
import { FormProvider, useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useApiKeysApi from '@/hooks/apiClients/useApiKeysApi';
import useProjectStore from '@/store/useProjectStore';

interface CreateApiKeyDialogProps {
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (open: boolean) => void;
}

const CreateApiKeyDialog: React.FC<CreateApiKeyDialogProps> = ({ isCreateDialogOpen, setIsCreateDialogOpen }) => {

    const { t } = useTranslation()
    const form = useForm<ApiKeyFormData>()
    const apiKeysApi = useApiKeysApi()
    const queryClient = useQueryClient()
    const project = useProjectStore()

    const createApiKeyMutation = useMutation({
        mutationFn: apiKeysApi.createApiKey,
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['api-keys', project.project?._id] });
        },
    });

    const onSubmit = async (data: ApiKeyFormData) => {
        await createApiKeyMutation.mutateAsync({
            name: data.name,
            expiresAt: data.expirationDate.toISOString()
        })
    }

    const showSuccess = createApiKeyMutation.isSuccess

    return (<Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                    {showSuccess ?
                        <DialogHeader>
                            <DialogTitle>{t('apiKeys.created_api_key')}</DialogTitle>
                            <DialogDescription>
                                {t('apiKeys.api_key_created_description')}
                            </DialogDescription>
                        </DialogHeader>
                    :
                        <DialogHeader>
                            <DialogTitle>{t('apiKeys.create_api_key')}</DialogTitle>
                            <DialogDescription>
                                {t('apiKeys.create_api_key_description')}
                            </DialogDescription>
                        </DialogHeader>
                    }
                    {showSuccess ?
                        <div className="mt-4 py-4 bg-gray-50 dark:bg-gray-800 rounded-md">
                            <div className="flex items-center justify-between">
                                <span className="font-mono bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded text-sm">
                                    {createApiKeyMutation.data.apiKey}
                                </span>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(createApiKeyMutation.data.apiKey);
                                    }}
                                    className="ml-2 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                    title="Copy to clipboard"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        :
                        <div className='py-4'>
                            <CreateApiKeyFormInner />
                        </div>
                    }

                    {showSuccess ?
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsCreateDialogOpen(false)}
                                disabled={form.formState.isSubmitting}
                            >
                                {t('common.close')}
                            </Button>
                        </DialogFooter>
                        :
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsCreateDialogOpen(false)}
                                disabled={form.formState.isSubmitting}
                            >
                                {t('common.cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={form.formState.isSubmitting}
                            >
                                {t('apiKeys.create_key')}
                            </Button>
                        </DialogFooter>
                    }
                </form>
            </FormProvider>
        </DialogContent>
    </Dialog>
    )
}

export default CreateApiKeyDialog