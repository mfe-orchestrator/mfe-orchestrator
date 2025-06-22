import { GoogleOAuthProvider } from '@react-oauth/google';
import { useEffect, useState, useMemo } from 'react';
import { useGlobalParameters } from '@/contexts/GlobalParameterProvider';
import { GoogleProviderConfig } from '@/types/ConfigResponseDTO';

interface GoogleAuthWrapperProps {
  children: React.ReactNode;
}

const GoogleAuthContent = ({ children }: { children: React.ReactNode }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const parameters = useGlobalParameters();
  const googleConfig = useMemo(() => {
    const config = parameters.getParameter('providers.google');
    return config as unknown as GoogleProviderConfig | undefined;
  }, [parameters]);

  // Initialize the Google OAuth2 client
  useEffect(() => {
    if (googleConfig?.clientId && !isInitialized) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsInitialized(true);
      };
      document.body.appendChild(script);

      return () => {
        document.body.removeChild(script);
      };
    }
  }, [googleConfig?.clientId, isInitialized]);

  if (!googleConfig?.clientId) {
    return <>{children}</>;
  }

  return <>{children}</>;
};

const GoogleAuthWrapper = ({ children }: GoogleAuthWrapperProps) => {
  const parameters = useGlobalParameters();
  const googleConfig = useMemo(() => {
    const config = parameters.getParameter('providers.google');
    return config as unknown as GoogleProviderConfig | undefined;
  }, [parameters]);

  if (!googleConfig?.clientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={googleConfig.clientId}>
      <GoogleAuthContent>{children}</GoogleAuthContent>
    </GoogleOAuthProvider>
  );
};

export default GoogleAuthWrapper;