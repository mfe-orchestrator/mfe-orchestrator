import { Button } from "@/components/ui/button";
import { useMsal } from "@azure/msal-react";


const LoginWithMicrosoftButton : React.FC = () => {

  const msalInstance = useMsal()
    
  const loginWithMicrosoft = () => {
    msalInstance.instance.loginPopup();
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