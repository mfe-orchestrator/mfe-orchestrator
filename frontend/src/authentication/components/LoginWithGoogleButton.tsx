import { Button } from "@/components/ui/button";
import { useGoogleLogin } from "@react-oauth/google";

const LoginWithGoogleButton : React.FC = () => {

    // const onSuccess = useCallback((credentialResponse: any) => {
    //   if (credentialResponse.credential) {
    //     // Decode the JWT token to get user info
    //     const base64Url = credentialResponse.credential.split('.')[1];
    //     const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    //     const jsonPayload = decodeURIComponent(
    //       atob(base64)
    //         .split('')
    //         .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
    //         .join('')
    //     );
    //     const userInfo = JSON.parse(jsonPayload);
  
    //     loginWithGoogle(credentialResponse.credential, {
    //       email: userInfo.email,
    //       name: userInfo.name,
    //     });
    //   }
    // }, [loginWithGoogle]);
  
    // const onError = useCallback(() => {
    //   console.error('Google login failed');
    // }, []);
  
    
      
//   const handleGoogleSuccess = useCallback((credentialResponse: { credential?: string }) => {
//     if (credentialResponse.credential) {
//       // Decode the JWT token to get user info
//       const base64Url = credentialResponse.credential.split('.')[1];
//       const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
//       const jsonPayload = decodeURIComponent(
//         atob(base64)
//           .split('')
//           .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
//           .join('')
//       );
//       const userInfo = JSON.parse(jsonPayload);
      
//       loginWithGoogle(credentialResponse.credential, {
//         email: userInfo.email,
//         name: userInfo.name,
//       });
      
//       navigate('/dashboard');
//     }
//   }, [loginWithGoogle, navigate]);

//   const handleGoogleError = useCallback(() => {
//     toast({
//       variant: 'destructive',
//       title: 'Errore di accesso',
//       description: 'Impossibile effettuare il login con Google. Riprova più tardi.',
//     });
//   }, [toast]);


  const login = useGoogleLogin({
    onSuccess: (credentialResponse) => {
      console.log("success", credentialResponse)
    },
    onError: () => {
      console.log("error")
    }
  })

  const onLogin = () => {
    login()
  }
    
    return <Button 
    variant="outline" 
    type="button" 
    className="flex flex-1"
    onClick={onLogin}
  >
    Google
  </Button>

}

export default LoginWithGoogleButton