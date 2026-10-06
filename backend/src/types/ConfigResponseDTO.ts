export default interface ConfigResponseDTO {
    frontendUrl: string
    canSendEmail: boolean
    canRegister: boolean
    allowEmbeddedLogin: boolean
    marketingOptInEnabled: boolean
    /** The remote MCP server: whether it is on, and the URL to give to MCP clients. */
    mcp: {
        enabled: boolean
        url: string
    }
    /** True when ANTHROPIC_API_KEY is set: the console then shows the assistant. */
    assistantEnabled: boolean
    codeRepository?: {
        github?: {
            clientId: string
        }
        azure?: {
            clientId: string
        }
    }
    providers: {
        auth0?: {
            domain: string
            clientId: string
            apiAudience: string
            scope: string
        }
        azure?: {
            tenantId: string
            clientId: string
            redirectUri: string
            authority: string
            scopes: string
            apiAudience: string
        }
        google?: {
            clientId: string
            redirectUri: string
            authScope: string
            hostedDomain: string
            apiAudience: string
        }
    }
}
