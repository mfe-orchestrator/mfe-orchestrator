import { useMutation, useQuery } from "@tanstack/react-query"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { setToken } from "@/authentication/tokenUtils"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import Spinner from "@/components/Spinner"
import useInvitationApi, { AcceptInvitationDTO } from "@/hooks/apiClients/useInvitationApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import useUserStore from "@/store/useUserStore"

interface FormValues {
    name?: string
    surname?: string
    password?: string
    confirmPassword?: string
}

const ISSUER = "microfrontend.orchestrator.hub"

const ProjectInvitation = () => {
    const { t } = useTranslation()
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const notifications = useToastNotificationStore()
    const userStore = useUserStore()
    const { getInvitation, acceptInvitation } = useInvitationApi()

    const form = useForm<FormValues>()

    const invitationQuery = useQuery({
        queryKey: ["invitation", token],
        queryFn: () => getInvitation(token || ""),
        enabled: !!token,
        retry: false
    })

    const invitation = invitationQuery.data

    const acceptMutation = useMutation({
        mutationFn: (data: AcceptInvitationDTO) => acceptInvitation(token || "", data),
        onSuccess: response => {
            setToken(response.accessToken, ISSUER)
            userStore.setUser(response.user)
            notifications.showSuccessNotification({ message: t("project_invitation.accepted") })
            navigate("/")
        }
    })

    const onAccept = (values: FormValues) => {
        acceptMutation.mutate(invitation?.needsPassword ? { name: values.name, surname: values.surname, password: values.password } : {})
    }

    return (
        <AuthenticationLayout
            title={t("project_invitation.title")}
            description={invitation ? t("project_invitation.description", { project: invitation.projectName, role: invitation.role }) : undefined}
        >
            <ApiStatusHandler queries={[invitationQuery]}>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onAccept)}>
                        <div className="grid gap-4">
                            {invitation?.needsPassword && (
                                <>
                                    <TextField name="name" label={t("project_invitation.name_label")} placeholder={t("project_invitation.name_label")} />
                                    <TextField name="surname" label={t("project_invitation.surname_label")} placeholder={t("project_invitation.surname_label")} />
                                    <TextField
                                        name="password"
                                        label={t("auth.password")}
                                        type="password"
                                        placeholder="••••••••"
                                        rules={{
                                            required: t("common.required_field") as string,
                                            minLength: { value: 8, message: t("auth.password_min_length") }
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
                                </>
                            )}

                            {acceptMutation.isPending ? (
                                <Spinner />
                            ) : (
                                <Button type="submit" className="w-full">
                                    {t("project_invitation.accept")}
                                </Button>
                            )}
                        </div>
                    </form>
                </FormProvider>
            </ApiStatusHandler>
        </AuthenticationLayout>
    )
}

export default ProjectInvitation
