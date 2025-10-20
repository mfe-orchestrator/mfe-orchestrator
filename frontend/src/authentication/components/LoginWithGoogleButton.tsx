import { Button } from "@/components/ui/button/button"
import { CodeResponse, TokenResponse, useGoogleLogin } from "@react-oauth/google"
import { LoginComponentProps } from "./LoginPage"
import { setToken } from "../tokenUtils"
import { getAccessToken } from "../googleAuthTokenUtils"
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"


const LoginWithGoogleButton: React.FC<LoginComponentProps> = ({ onSuccessLogin }) => {
    const parameters = useGlobalParameters()

    const onSuccess = async (tokenResponse: Omit<CodeResponse, "error" | "error_description" | "error_uri">) => {
        try {
              // Scambia il codice con i token
              const tokenData = await getAccessToken(tokenResponse.code)
              
              setToken(tokenData.access_token, "google")

              // Salva il refresh token se presente
              if (tokenData.refresh_token) {
                  localStorage.setItem("googleRefreshToken", tokenData.refresh_token)
              }

              const expiresAt = Date.now() + tokenData.expires_in * 1000
              localStorage.setItem("googleTokenExpiresAt", expiresAt.toString())
              localStorage.setItem("googleData", JSON.stringify(tokenData))

              onSuccessLogin?.()
          } catch (error) {
              console.error("Error exchanging code for tokens:", error)
          }
    }

  const onError = (
    errorResponse: Pick<TokenResponse, "error" | "error_description" | "error_uri">,
  ) => {
    console.log("Google Login Failed", errorResponse);
  };

    const login = useGoogleLogin({
        onSuccess,
        onError,
        enable_serial_consent: true,
        scope: "openid profile email",
        flow: "auth-code",
        
    })

  return (
    <Button
      variant="secondary"
      type="button"
      className="flex flex-1"
      onClick={() => login()}>
      Google
    </Button>
  );
};

export default LoginWithGoogleButton;
