import { MsalProvider } from '@azure/msal-react';
import React, { useEffect, useMemo, useState } from 'react';
import { EventMessage, EventType, PublicClientApplication } from '@azure/msal-browser';
import { useGlobalParameters } from '@/contexts/GlobalParameterProvider';
import { AzureProviderConfig } from '@/types/ConfigResponseDTO';

interface MicrosoftAuthWrapperProps {
  children: React.ReactNode;
}

const MicrosoftAuthWrapper : React.FC<MicrosoftAuthWrapperProps> =  ({ children }) => {
  const parameters = useGlobalParameters();
  const azureParameters = parameters.getParameter('providers.azure') as unknown as AzureProviderConfig;
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!azureParameters?.clientId || !azureParameters?.tenantId) {
      return;
    }
  
    const instance = new PublicClientApplication({
      auth: {
        clientId: azureParameters.clientId,
        authority: `https://login.microsoftonline.com/${azureParameters.tenantId}`,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'localStorage',
        storeAuthStateInCookie: false,
      }
    });

    const eventCallback = (event: EventMessage) => {
      console.log('MSAL Event:', event.eventType);
      
      if (event.eventType === EventType.INITIALIZE_END) {
        console.log("MSAL initialization complete");
        setIsInitialized(true);
      }
    };

    const callbackId = instance.addEventCallback(eventCallback);

    // Inizializza MSAL
    instance.initialize()
      .then(() => {
        console.log("MSAL initialize completed");
        
      })
      .catch(error => {
        console.error("MSAL initialize failed:", error);
      });

    setMsalInstance(instance);

    // Cleanup
    return () => {
      if (callbackId) {
        instance.removeEventCallback(callbackId);
      }
    };
  }, [azureParameters?.clientId, azureParameters?.tenantId]);

  if (!azureParameters?.clientId || !azureParameters?.tenantId) {
    return <>{children}</>;
  }

  if (!msalInstance || !isInitialized) {
    return <></>;
  }


  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
};

export default MicrosoftAuthWrapper;