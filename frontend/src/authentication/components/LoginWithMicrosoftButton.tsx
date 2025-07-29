import { Button } from "@/components/ui/button";
import { useMsal } from "@azure/msal-react";
import { LoginComponentProps } from "./LoginPage";
import { deleteToken } from "../tokenUtils";


const LoginWithMicrosoftButton : React.FC<LoginComponentProps> = ({onSuccessLogin}) => {

  const msalInstance = useMsal()
    
  const loginWithMicrosoft = () => {
    msalInstance.instance.loginPopup();
    deleteToken();
    onSuccessLogin?.();
  }
    
    return <Button 
    variant="outline" 
    type="button" 
    className="flex flex-1"
    onClick={loginWithMicrosoft}
  >
    Microsoft
  </Button>

}

export default LoginWithMicrosoftButton