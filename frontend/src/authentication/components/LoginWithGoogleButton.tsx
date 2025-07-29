import { Button } from "@/components/ui/button";
import { TokenResponse, useGoogleLogin } from "@react-oauth/google";
import { LoginComponentProps } from "./LoginPage";  
import { setToken } from "../tokenUtils";


const LoginWithGoogleButton : React.FC<LoginComponentProps> = ({onSuccessLogin}) => {

  const onSuccess = (tokenResponse: Omit<TokenResponse, 'error' | 'error_description' | 'error_uri'>) =>{
    console.log("success", tokenResponse)
    setToken(tokenResponse.access_token, "google")
    localStorage.setItem("googleData", JSON.stringify(tokenResponse))
    onSuccessLogin?.();
  }
  
    const onError = (errorResponse: Pick<TokenResponse, 'error' | 'error_description' | 'error_uri'>) =>{
      console.log("Google Login Failed", errorResponse)
    }
    
  const login = useGoogleLogin({
    onSuccess,
    onError,     
    enable_serial_consent: true,
    scope: "openid profile email",
    flow: "implicit" 
  })
    
    return <Button 
    variant="outline" 
    type="button" 
    className="flex flex-1"
    onClick={() => login()}
  >
    Google
  </Button>

}

export default LoginWithGoogleButton