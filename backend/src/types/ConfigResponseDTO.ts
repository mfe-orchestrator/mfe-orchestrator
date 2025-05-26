export default interface ConfigResponseDTO {
    frontendUrl: string;
    providers: {
        auth0?: {
            domain: string;
            clientId: string;
            apiAudience: string;
        };
        azure?: {
            tenantId: string;
            clientId: string;
            redirectUri: string;
            authority: string;
            scopes: string;
            apiAudience: string;
        };
        google?: {
            clientId: string;
            redirectUri: string;
            authScope: string;
            hostedDomain: string;
            apiAudience: string;
        };
    };
}
