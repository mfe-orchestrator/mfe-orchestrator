import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import Spinner from "@/components/Spinner"
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"
import useUserApi from "@/hooks/apiClients/useUserApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface FormValues {
    email: string
    password: string
    confirmPassword: string
}

export const SignUp = () => {
    const { t } = useTranslation()
    const { register } = useUserApi()
    const navigate = useNavigate()
    const globalParameters = useGlobalParameters()
    const notifications = useToastNotificationStore()
    const [showGreeting, setShowGreeting] = useState<boolean>(false)

    const form = useForm<FormValues>({})

    const registerMutation = useMutation({
        mutationFn: register
    })

    const handleRegister = async (values: FormValues) => {
        await registerMutation.mutateAsync({
            email: values.email,
            password: values.password
        })
        if (globalParameters.getParameter("canSendEmail")) {
            setShowGreeting(true)
        } else {
            notifications.showSuccessNotification({
                message: t("auth.registration_success")
            })
            navigate("/")
        }
    }

    return (
        <AuthenticationLayout
            title={t("auth.create_account")}
            description={t("auth.register_description")}
            footer={
                <p className="text-sm text-foreground-secondary">
                    {t("auth.already_have_account")}{" "}
                    <Link to="/login" className="text-primary underline-offset-4 underline">
                        {t("auth.login")}
                    </Link>
                </p>
            }
        >
            {showGreeting ? (
                <p className="text-center" data-testId="registration-success">
                    {t("auth.registration_success_email")}
                </p>
            ) : (
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(handleRegister)}>
                        <div>
                            <TextField
                                name="email"
                                label={t("auth.email")}
                                type="email"
                                placeholder={t("auth.email_placeholder")}
                                id="email"
                                rules={{
                                    required: t("common.required_field") as string,
                                    pattern: {
                                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                        message: t("auth.invalid_email") as string
                                    }
                                }}
                            />

                            <TextField
                                name="password"
                                label={t("auth.password")}
                                type="password"
                                placeholder="••••••••"
                                id="password"
                                rules={{
                                    required: t("common.required_field") as string,
                                    minLength: {
                                        value: 8,
                                        message: t("auth.password_min_length") as string
                                    }
                                }}
                                containerClassName="mt-4"
                            />

                            <TextField
                                name="confirmPassword"
                                label={t("auth.confirm_password")}
                                type="password"
                                placeholder="••••••••"
                                id="confirm-password"
                                rules={{
                                    required: t("common.required_field") as string,
                                    validate: (value: string) => value === form.getValues("password") || (t("auth.passwords_dont_match") as string)
                                }}
                                containerClassName="mt-4"
                            />

                            {registerMutation.isPending ? (
                                <Spinner />
                            ) : (
                                <Button type="submit" id="create-account" className="w-full mt-5">
                                    {t("auth.create_account")}
                                </Button>
                            )}
                        </div>
                    </form>
                </FormProvider>
            )}
        </AuthenticationLayout>
    )
}

export default SignUp
