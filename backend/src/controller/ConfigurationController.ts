import { FastifyInstance } from 'fastify';
import ConfigResponseDTO from '../types/ConfigResponseDTO';

export default async function configurationController(fastify: FastifyInstance) {

    fastify.get('/configuration', { config: { public: true} }, async (request, reply) => {
        const config = fastify.config;
        const response: ConfigResponseDTO = {
            canSendEmail: Boolean(config.EMAIL_SMTP_HOST),
            canRegister: Boolean(config.REGISTRATION_ALLOWED) && Boolean(config.ALLOW_EMBEDDED_LOGIN),
            allowEmbeddedLogin: Boolean(config.ALLOW_EMBEDDED_LOGIN),
            frontendUrl: config.FRONTEND_URL,
            providers: {}
        }
        
        // Aggiungi provider solo se attivo
        if (config.AUTH0_DOMAIN) {
            response.providers.auth0 = {
                domain: config.AUTH0_DOMAIN,
                clientId: config.AUTH0_CLIENT_ID,
                apiAudience: config.AUTH0_API_AUDIENCE
            };
        }

        if (config.AZURE_ENTRAID_TENANT_ID) {
            response.providers.azure = {
                tenantId: config.AZURE_ENTRAID_TENANT_ID,
                clientId: config.AZURE_ENTRAID_CLIENT_ID,
                redirectUri: config.AZURE_ENTRAID_REDIRECT_URI,
                authority: config.AZURE_ENTRAID_AUTHORITY || 'https://login.microsoftonline.com',
                scopes: config.AZURE_ENTRAID_SCOPES || 'openid profile email',
                apiAudience: config.AZURE_ENTRAID_API_AUDIENCE
            };
        }

        if (config.GOOGLE_CLIENT_ID) {
            response.providers.google = {
                clientId: config.GOOGLE_CLIENT_ID,
                redirectUri: config.GOOGLE_REDIRECT_URI,
                authScope: config.GOOGLE_AUTH_SCOPE || 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
                hostedDomain: config.GOOGLE_AUTH_HOSTED_DOMAIN || '',
                apiAudience: config.GOOGLE_API_AUDIENCE
            };
        }
        return reply.send(response);
    });
}