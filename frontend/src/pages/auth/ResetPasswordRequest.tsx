import { Spinner } from "@mfe-orchestrator/design-system"
import { useMutation } from "@tanstack/react-query"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import useUserApi from "@/hooks/apiClients/useUserApi"
import { errorCodeOf } from "@/hooks/useApiClient"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface FormValues {
    email: string
}

export const ResetPasswordRequest = () => {
    const { t } = useTranslation()
    const { resetPasswordRequest } = useUserApi()
    const navigate = useNavigate()
    const notifications = useToastNotificationStore()

    const form = useForm<FormValues>({})

    const resetPasswordMutation = useMutation({
        mutationFn: (data: FormValues) =>
            resetPasswordRequest(data, {
                // An installation without SMTP cannot reset a password at all: the backend says
                // so by code, and the code is what gets translated - the message it carries is
                // an English string meant for the log.
                customErrorMessage: error => (errorCodeOf(error) === "EMAIL_NOT_CONFIGURED" ? t("auth.recover_password_email_not_configured") : t("auth.recover_password_error"))
            })
    })

    const handleRegister = async (values: FormValues) => {
        try {
            // mutate() returns void and swallows the rejection, so awaiting it announced the
            // email as sent even for a request the backend had refused. mutateAsync() is the
            // one that rejects, which is what keeps the confirmation on the success path.
            await resetPasswordMutation.mutateAsync({
                email: values.email
            })
        } catch {
            // The failure is already on screen: the API client raises the toast for it. Here
            // there is only the confirmation and the redirect to hold back.
            return
        }
        notifications.showSuccessNotification({
            message: t("auth.recover_password_success")
        })
        navigate("/")
    }

    return (
        <AuthenticationLayout title={t("auth.recover_password")} description={t("auth.recover_password_description")}>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(handleRegister)}>
                    <div className="grid gap-4">
                        <TextField
                            name="email"
                            label={t("auth.email")}
                            type="email"
                            placeholder={t("auth.email_placeholder")}
                            rules={{
                                required: t("common.required_field") as string,
                                pattern: {
                                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                    message: t("auth.invalid_email")
                                }
                            }}
                        />
                        {resetPasswordMutation.isPending ? (
                            <Spinner />
                        ) : (
                            <Button type="submit" className="w-full" dataTestId="reset-password">
                                {t("auth.recover_password_button")}
                            </Button>
                        )}
                    </div>
                </form>
            </FormProvider>
        </AuthenticationLayout>
    )
}

export default ResetPasswordRequest
