import { useMutation, useQuery } from "@tanstack/react-query"
import { AxiosError } from "axios"
import { MailX } from "lucide-react"
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
    password?: string
    confirmPassword?: string
}

const ISSUER = "microfrontend.orchestrator.hub"

/** Friendly screen for an invitation link that can't be loaded (404 = token unknown/expired). */
const InvitationError: React.FC<{ error: unknown }> = ({ error }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const notFound = error instanceof AxiosError && error.response?.status === 404

    return (
        <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <MailX className="size-6 text-primary" />
            </div>
            <div>
                <h3 className="font-semibold text-foreground">{t(notFound ? "project_invitation.not_found_title" : "project_invitation.error_title")}</h3>
                <p className="mt-1 text-sm text-foreground-secondary">{t(notFound ? "project_invitation.not_found_description" : "project_invitation.error_description")}</p>
            </div>
            <Button className="w-full" onClick={() => navigate("/")}>
                {t("project_invitation.go_to_login")}
            </Button>
        </div>
    )
}

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
        acceptMutation.mutate(invitation?.needsPassword ? { password: values.password } : {})
    }

    return (
        <AuthenticationLayout
            title={t("project_invitation.title")}
            description={invitation ? t("project_invitation.description", { project: invitation.projectName, role: invitation.role }) : undefined}
        >
            <ApiStatusHandler queries={[invitationQuery]} errorComponent={error => <InvitationError error={error} />}>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onAccept)}>
                        <div className="grid gap-4">
                            {invitation?.needsPassword && (
                                <>
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
