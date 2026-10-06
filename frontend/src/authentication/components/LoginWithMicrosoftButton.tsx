import { BrowserAuthError } from "@azure/msal-browser"
import { useMsal } from "@azure/msal-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { deleteToken } from "../tokenUtils"
import { LoginComponentProps } from "./LoginPage"

const LoginWithMicrosoftButton: React.FC<LoginComponentProps> = ({ onSuccessLogin }) => {
    const msalInstance = useMsal()
    const { t } = useTranslation()
    const notifications = useToastNotificationStore()

    const loginWithMicrosoft = async () => {
        try {
            await msalInstance.instance.loginPopup()
        } catch (error) {
            // Closing the popup is the user's choice, not a failure.
            if (error instanceof BrowserAuthError && error.errorCode === "user_cancelled") return
            console.error("Microsoft login failed:", error)
            notifications.showErrorNotification({ message: t("auth.microsoft_login_failed") })
            return
        }
        deleteToken()
        onSuccessLogin?.()
    }

    return (
        <Button variant="secondary" type="button" className="flex flex-1" onClick={loginWithMicrosoft}>
            Microsoft
        </Button>
    )
}

export default LoginWithMicrosoftButton
