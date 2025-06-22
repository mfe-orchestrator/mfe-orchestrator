import { Auth0Provider } from '@auth0/auth0-react';
import { useMemo } from 'react';
import { useGlobalParameters } from '@/contexts/GlobalParameterProvider';
import { Auth0ProviderConfig } from '@/types/ConfigResponseDTO';

interface Auth0AuthWrapperProps {
  children: React.ReactNode;
}

const Auth0AuthWrapper = ({ children }: Auth0AuthWrapperProps) => {
  const parameters = useGlobalParameters();
  const auth0Config = useMemo(() => {
    const config = parameters.getParameter('providers.auth0');
    return config as unknown as Auth0ProviderConfig | undefined;
  }, [parameters]);

  if (!auth0Config || !auth0Config.domain || !auth0Config.clientId) {
    return <>{children}</>;
  }

  return (
    <Auth0Provider
      domain={auth0Config.domain}
      clientId={auth0Config.clientId}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: auth0Config.apiAudience,
      }}
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
      <>{children}</>
    </Auth0Provider>
  );
};

export default Auth0AuthWrapper;