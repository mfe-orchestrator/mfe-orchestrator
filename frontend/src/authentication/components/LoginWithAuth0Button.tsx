import { Button } from "@/components/ui/button";
import { useAuth0 } from "@auth0/auth0-react";
import LoginComponentProps from "./LoginComponentProps";
import { deleteToken } from "../tokenUtils";


const LoginWithAuth0Button : React.FC<LoginComponentProps> = ({onSuccessLogin}) => {

  const auth = useAuth0();

  const handleAuth0Login = async () => {
    await auth.loginWithPopup();
    deleteToken();
    onSuccessLogin?.();
  }  
    
  return <Button 
    variant="outline" 
    type="button" 
    className="flex flex-1"
    onClick={handleAuth0Login}
  >
    Auth0
  </Button>

}

export default LoginWithAuth0Button