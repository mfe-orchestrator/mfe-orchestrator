import { Button } from "@/components/ui/button";
import { useAuth0 } from "@auth0/auth0-react";


const LoginWithAuth0Button : React.FC = () => {

  const auth = useAuth0();

  const handleAuth0Login = () => {
    auth.loginWithPopup();
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