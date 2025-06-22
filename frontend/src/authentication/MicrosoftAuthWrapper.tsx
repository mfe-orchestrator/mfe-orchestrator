import { MsalProvider } from '@azure/msal-react';
import { useMemo, useState } from 'react';
import { EventType, PublicClientApplication } from '@azure/msal-browser';
import { useGlobalParameters } from '@/contexts/GlobalParameterProvider';
import { AzureProviderConfig } from '@/types/ConfigResponseDTO';

interface MicrosoftAuthWrapperProps {
  children: React.ReactNode;
}

const MicrosoftAuthWrapper = ({ children }: MicrosoftAuthWrapperProps) => {
  const parameters = useGlobalParameters();
  const azureParameters = parameters.getParameter('providers.azure') as any as AzureProviderConfig
  const [isMsalInitialized, setIsMsalInitialized] = useState(false)

  const msalInstance = useMemo(() => {
    if(!azureParameters || !azureParameters?.clientId){
      return null;
    }
    
    const instance =   new PublicClientApplication({
      auth: {
        clientId: azureParameters.clientId,
        authority: `https://login.microsoftonline.com/${azureParameters.tenantId}`,
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false,
      },
    })

    instance.addEventCallback(event => {
      //logger.log("msalEvent: " + event.eventType, "initializeMSAL", event)
      if (event.eventType === EventType.INITIALIZE_END) {
          //logger.log("INITIALIZE_END ", "initializeMSAL", instance.getAllAccounts())
          if (instance.getAllAccounts().length > 0) {
            instance.setActiveAccount(instance.getAllAccounts()[0])
          }
      } else if (event.eventType === EventType.LOGIN_SUCCESS) {
          const account = (event as any).payload.account
          //logger.log("LOGIN SUCCES", "initializeMASL", { accounts: instance.getAllAccounts(), event })
          if (account) {
            instance.setActiveAccount(account)
          }
      }
      setIsMsalInitialized(true)
    })

    instance.initialize()

    return instance;
  }, [parameters])

  // useEffect(() => {
  //   const handleAuth = async () => {
  //     if (accounts.length > 0 && msalConfig.auth.clientId) {
  //       // User is already logged in with Microsoft
  //       const account = accounts[0];
  //       try {
  //         const response = await instance.acquireTokenSilent({
  //           ...loginRequest,
  //           account: account
  //         });
          
  //         loginWithMicrosoft(
  //           response.accessToken,
  //           {
  //             email: account.username,
  //             name: account.name || account.username
  //           }
  //         );
          
  //         navigate('/dashboard');
  //       } catch (error) {
  //         console.error('Error acquiring token:', error);
  //         toast({
  //           variant: 'destructive',
  //           title: 'Errore di autenticazione',
  //           description: 'Si è verificato un errore durante il login con Microsoft.',
  //         });
  //       }
  //     }
  //   };
    
  //   handleAuth();
  // }, [accounts, instance, loginWithMicrosoft, navigate, toast]);

  // const handleMicrosoftLogin = async (e: React.MouseEvent) => {
  //   e.preventDefault();
  //   if (!msalConfig.auth.clientId) {
  //     toast({
  //       variant: 'destructive',
  //       title: 'Errore di configurazione',
  //       description: 'Configurazione Microsoft non trovata. Contatta l\'amministratore.',
  //     });
  //     return;
  //   }
    
  //   try {
  //     await instance.loginRedirect(loginRequest);
  //   } catch (error) {
  //     console.error('Error during Microsoft login:', error);
  //     toast({
  //       variant: 'destructive',
  //       title: 'Errore di accesso',
  //       description: 'Impossibile effettuare il login con Microsoft. Riprova più tardi.',
  //     });
  //   }
  // };

  if(!azureParameters || !azureParameters?.clientId){
    return <>{children}</>;
  }

  if (!isMsalInitialized) return <></>

  if (!msalInstance) return <>{children}</>

  return (
    <MsalProvider instance={msalInstance}>
      {children}
    </MsalProvider>
  );

};

export default MicrosoftAuthWrapper;
