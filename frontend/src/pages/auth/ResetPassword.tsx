import { Spinner } from "@mfe-orchestrator/design-system"
import { useMutation } from "@tanstack/react-query"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import useUserApi from "@/hooks/apiClients/useUserApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface FormValues {
    password: string
    confirmPassword: string
}

const ResetPassword = () => {
    const { t } = useTranslation()
    const { resetPassword } = useUserApi()
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const notifications = useToastNotificationStore()

    const form = useForm<FormValues>({})

    const registerMutation = useMutation({
        mutationFn: resetPassword
    })

    const handleRegister = async (values: FormValues) => {
        await registerMutation.mutateAsync({
            password: values.password,
            token
        })
        notifications.showSuccessNotification({
            message: t("auth.reset_password_success")
        })
        navigate("/")
    }

    return (
        <AuthenticationLayout title={t("auth.reset_password")} description={t("auth.reset_password_description")}>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(handleRegister)}>
                    <div className="grid gap-4">
                        <TextField
                            name="password"
                            label={t("auth.password")}
                            type="password"
                            placeholder="••••••••"
                            rules={{
                                required: t("common.required_field") as string,
                                minLength: {
                                    value: 8,
                                    message: t("auth.password_min_length")
                                }
                            }}
                        />

                        <TextField
                            name="confirmPassword"
                            label={t("auth.confirm_password")}
                            type="password"
                            placeholder="••••••••"
                            rules={{
                                required: t("common.required_field") as string,
                                validate: (value: string) => value === form.getValues("password") || t("auth.passwords_dont_match")
                            }}
                        />

                        {registerMutation.isPending ? (
                            <Spinner />
                        ) : (
                            <Button type="submit" className="w-full">
                                {t("auth.reset_password")}
                            </Button>
                        )}
                    </div>
                </form>
            </FormProvider>
        </AuthenticationLayout>
    )
}

export default ResetPassword
