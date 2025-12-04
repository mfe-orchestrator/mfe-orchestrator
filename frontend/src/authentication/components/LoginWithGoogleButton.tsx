import { CodeResponse, TokenResponse, useGoogleLogin } from "@react-oauth/google"
import { Button } from "@/components/atoms"
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"
import { getAccessToken } from "../googleAuthTokenUtils"
import { setToken } from "../tokenUtils"
import { LoginComponentProps } from "./LoginPage"

const LoginWithGoogleButton: React.FC<LoginComponentProps> = ({ onSuccessLogin }) => {
    const parameters = useGlobalParameters()

    const onSuccess = async (tokenResponse: Omit<CodeResponse, "error" | "error_description" | "error_uri">) => {
        try {
            // Scambia il codice con i token
            const tokenData = await getAccessToken(tokenResponse.code)

            const expiresAt = Date.now() + tokenData.expires_in * 1000

            setToken(tokenData.access_token, "google", expiresAt.toString(), tokenData.refresh_token)

            localStorage.setItem("googleData", JSON.stringify(tokenData))

            onSuccessLogin?.()
        } catch (error) {
            console.error("Error exchanging code for tokens:", error)
        }
    }

    const onError = (errorResponse: Pick<TokenResponse, "error" | "error_description" | "error_uri">) => {
        console.log("Google Login Failed", errorResponse)
    }

    const login = useGoogleLogin({
        onSuccess,
        onError,
        enable_serial_consent: true,
        scope: "openid profile email",
        flow: "auth-code",
        redirect_uri: parameters.getParameter("providers.google.redirectUri") as string
    })

    return (
        <Button variant="secondary" type="button" className="flex flex-1" onClick={() => login()}>
            Google
        </Button>
    )
}

export default LoginWithGoogleButton
