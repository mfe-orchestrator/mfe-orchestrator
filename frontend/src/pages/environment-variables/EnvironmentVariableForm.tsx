import { FormProvider, useForm } from 'react-hook-form';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button/button';
import TextField from '@/components/input/TextField.rhf';

// Schema for individual environment value
const environmentValueSchema = z.object({
  environmentSlug: z.string(),
  value: z.string().min(1, 'Value is required'),
  _id: z.string().optional(),
});

// Main form schema
export const formSchema = z.object({
  key: z.string().min(1, 'Key is required'),
  values: z.array(environmentValueSchema).min(1, 'At least one environment value is required'),
});

export type EnvironmentValue = z.infer<typeof environmentValueSchema>;
export type FormValues = z.infer<typeof formSchema>;

interface EnvironmentVariableFormProps {
  initialData?: Partial<FormValues> & { values?: EnvironmentValue[] };
  environments: Array<{ slug: string; name: string; _id?: string }>;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function EnvironmentVariableForm({
  initialData,
  environments,
  onSubmit,
  onCancel,
  isLoading = false,
}: EnvironmentVariableFormProps) {
  const { t } = useTranslation();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      key: initialData?.key || '',
      values: initialData?.values || environments.map(env => ({
        environmentSlug: env.slug,
        value: '',
        _id: env._id,
      })),
    },
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <TextField name="key" label={t('environmentVariables.form.key')} />
        
        <div className="space-y-4">
          <h3 className="text-sm font-medium">
            {t('environmentVariables.form.environment_values')}
          </h3>
          
          {environments.map((env, index) => (
            <>
                <TextField name={`values.${index}.value`} label={env.name} placeholder={t('environmentVariables.form.value_placeholder', { env: env.name })} />
                <input type="hidden" {...form.register(`values.${index}.environmentSlug`)} value={env.slug} />
            </>
          ))}
          
          {form.formState.errors.values && (
            <p className="text-sm font-medium text-destructive">
              {form.formState.errors.values.message}
            </p>
          )}
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
