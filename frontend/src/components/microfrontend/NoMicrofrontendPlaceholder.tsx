

import { useForm, FormProvider } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button/button"
import TextField from '@/components/input/TextField.rhf';
import Switch from '@/components/input/Switch.rhf';
import SelectField from '@/components/input/SelectField.rhf';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import useMicrofrontendsApi, { HostedOn, Microfrontend } from '@/hooks/apiClients/useMicrofrontendsApi';
import useToastNotificationStore from '@/store/useToastNotificationStore';
import React from 'react';
import TextareaField from '../input/TextareaField.rhf';

interface NoMicrofrontendPlaceholderProps {
    projectId: string;
}

interface FormValues {
    name: string;
    slug: string;
    description: string;
    version: string;
    continuousDeployment: boolean;
    status: 'ACTIVE' | 'INACTIVE';
};

const NoMicrofrontendPlaceholder: React.FC<NoMicrofrontendPlaceholderProps> = ({ projectId }) => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const microfrontendsApi = useMicrofrontendsApi()
    const { showSuccessNotification } = useToastNotificationStore();

    const form = useForm<FormValues>({
        defaultValues: {
            name: '',
            description: '',
            version: '1.0.0',
            continuousDeployment: false,
            status: 'ACTIVE',
        },
    });

    const createMicrofrontendMutation = useMutation({
        mutationFn: microfrontendsApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['microfrontends-by-project-id', projectId] });
            showSuccessNotification({
                message: t('microfrontend.your_microfrontend_has_been_created'),
            });
            form.reset();
        }
    });

    const onSubmit = async (data: FormValues) => {
        if (!projectId) {
            throw new Error('Project ID is required');
        }

        const out = {
            ...data,
            projectId: projectId,
            host:{
                type: HostedOn.MFE_ORCHESTRATOR_HUB,                
            }
        } as unknown as Microfrontend;

        await createMicrofrontendMutation.mutateAsync(out);
    };

    return (
        <div className="max-w-2xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground">
                    {t('microfrontend.no_microfrontends_found')}
                </h2>
                <p className="mt-2 text-muted-foreground">
                    {t('microfrontend.add_your_first_microfrontend')}
                </p>
            </div>

            <div className="bg-card p-6 rounded-lg shadow-sm border">
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <TextField
                                    name="name"
                                    label={t('microfrontend.name')}
                                    placeholder={t('microfrontend.name_placeholder')}
                                    rules={{ required: t('common.required_field') }}
                                    required
                                    className="w-full"
                                />

                                <TextField
                                    name="slug"
                                    textTransform={(e) => e.replace(/[^a-z0-9]/gi, '-').toLocaleLowerCase()}
                                    label={t('microfrontend.slug')}
                                    placeholder={t('microfrontend.slug_placeholder')}
                                    rules={{ required: t('common.required_field') }}
                                    required
                                    className="w-full"
                                />

                                <TextField
                                    name="version"
                                    label={t('microfrontend.version')}
                                    placeholder={t('microfrontend.version_placeholder')}
                                    rules={{ required: t('common.required_field') }}
                                    required
                                    className="w-full"
                                    defaultValue="1.0.0"
                                />

                                <SelectField
                                    name="status"
                                    label={t('microfrontend.status')}
                                    required
                                    rules={{ required: t('common.required_field') }}
                                    options={[
                                        { value: 'ACTIVE', label: t('common.active') },
                                        { value: 'INACTIVE', label: t('common.inactive') },
                                    ]}
                                    className="w-full"
                                />
                            </div>

                            <TextareaField
                                name="description"
                                label={t('microfrontend.description')}
                                placeholder={t('microfrontend.description_placeholder')}
                            />

                            <div className="flex items-center justify-between pt-2">
                                <div>
                                    <h4 className="text-sm font-medium">{t('microfrontend.continuous_deployment')}</h4>
                                    <p className="text-sm text-muted-foreground">
                                        {t('microfrontend.continuous_deployment_description')}
                                    </p>
                                </div>
                                <Switch
                                    name="continuousDeployment"
                                    label=""
                                    rules={{}}
                                />
                            </div>


                        </div>

                        <div className="pt-4">
                            <p className="text-sm text-muted-foreground mb-4">
                                {t('microfrontend.dont_worry')}
                            </p>

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={createMicrofrontendMutation.isPending}
                            >
                                {createMicrofrontendMutation.isPending ? (
                                    <>{t('common.creating')}...</>
                                ) : (
                                    t('microfrontend.create_microfrontend')
                                )}
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </div>
        </div>
    );
}

export default NoMicrofrontendPlaceholder