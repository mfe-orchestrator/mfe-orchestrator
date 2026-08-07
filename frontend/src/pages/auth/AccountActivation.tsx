import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { ApiStatusHandler } from "@/components/organisms"
import useUserApi from "@/hooks/apiClients/useUserApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

export const AccountActivation = () => {
    const { t } = useTranslation()
    const { activateAccount } = useUserApi()
    const { token } = useParams<{ token: string }>()
    const navigate = useNavigate()
    const notifications = useToastNotificationStore()

    const accountActivatonQuery = useQuery({
        queryKey: ["account-activation", token],
        queryFn: async () => {
            await activateAccount(token)
            notifications.showSuccessNotification({
                message: t("auth.account_activation.success")
            })
            navigate("/")
        }
    })

    return (
        <AuthenticationLayout title={t("auth.account_activation.title")} description={t("auth.account_activation.description")}>
            <ApiStatusHandler queries={[accountActivatonQuery]}>
                <h1>{t("auth.account_activation.success")}</h1>
            </ApiStatusHandler>
        </AuthenticationLayout>
    )
}

export default AccountActivation
