
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button/button"
import useUserApi from "@/hooks/apiClients/useUserApi";
import TextField from "@/components/input/TextField.rhf";
import { FormProvider } from "react-hook-form";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import Spinner from "@/components/Spinner";
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout";
import { useTranslation } from "react-i18next";
import useToastNotificationStore from "@/store/useToastNotificationStore";

interface FormValues {
  email: string;
}

export const ResetPasswordRequest = () => {
  const { t } = useTranslation();
  const { resetPasswordRequest } = useUserApi();
  const navigate = useNavigate();
  const notifications = useToastNotificationStore()

  const form = useForm<FormValues>({});

  const resetPasswordMutation = useMutation({
    mutationFn: resetPasswordRequest
  })

  const handleRegister = async (values: FormValues) => {
    await resetPasswordMutation.mutate({
      email: values.email
    })
    notifications.showSuccessNotification({
      message: t('auth.recover_password_success')
    })
    navigate('/')
  };

  return (
    <AuthenticationLayout
      title={t('auth.recover_password')}
      description={t('auth.recover_password_description')}
    >
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(handleRegister)}>
          <div className="grid gap-4">
            <TextField
              name="email"
              label={t('auth.email')}
              type="email"
              placeholder={t('auth.email_placeholder')}
              rules={{
                required: t('common.required_field') as string,
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: t('auth.invalid_email')
                }
              }}
            />
            {resetPasswordMutation.isPending ?
              <Spinner />
              :
              <Button type="submit" className="w-full">
                {t('auth.recover_password_button')}
              </Button>
            }
          </div>
        </form>
      </FormProvider>
    </AuthenticationLayout>
  );
};

export default ResetPasswordRequest;
