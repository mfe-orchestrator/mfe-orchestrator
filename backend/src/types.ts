export interface MicrofrontendConfig {
    sso: {
        enabled: boolean;
        provider: string;
        clientId: string;
        realm: string;
        authServerUrl: string;
        redirectUri: string;
        scope: string;
        tokenEndpoint: string;
        authorizationEndpoint: string;
    };
}
