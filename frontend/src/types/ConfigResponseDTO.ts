export interface Auth0ProviderConfig {
    domain: string
    clientId: string
    apiAudience: string
}

export interface AzureProviderConfig {
    tenantId: string
    clientId: string
    redirectUri: string
    authority: string
    scopes: string
    apiAudience: string
}

export interface GoogleProviderConfig {
    clientId: string
    redirectUri: string
    authScope: string
    hostedDomain: string
    apiAudience: string
}

export interface AuthProvidersConfig {
    auth0?: Auth0ProviderConfig
    azure?: AzureProviderConfig
    google?: GoogleProviderConfig
}

export default interface GlobalConfigDTO {
    frontendUrl: string
    registrationAllowed: boolean
    canSendEmail: boolean
    marketingOptInEnabled: boolean
    /** True when the backend has an ANTHROPIC_API_KEY: the console then shows the assistant. */
    assistantEnabled?: boolean
    providers: AuthProvidersConfig
    mcp: {
        enabled: boolean
        url: string
    }
    codeRepository?: {
        github?: {
            clientId: string
        }
        azure?: {
            clientId: string
        }
    }
}
