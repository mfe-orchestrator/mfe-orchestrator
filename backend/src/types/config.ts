export interface Config {
    PORT: number;
    DATABASE_URL: string;
    AUTH0_DOMAIN: string;
    AUTH0_CLIENT_ID: string;
    AUTH0_SECRET: string;
    AUTH0_API_AUDIENCE: string;
    ALLOWED_ORIGINS: string[];
    REDIS_URL: string;
    REDIS_PASSWORD: string;
    AZURE_ENTRAID_TENANT_ID: string;
    AZURE_ENTRAID_CLIENT_ID: string;
    AZURE_ENTRAID_REDIRECT_URI: string;
    AZURE_ENTRAID_AUTHORITY: string;
    AZURE_ENTRAID_SCOPES: string;
    AZURE_ENTRAID_API_AUDIENCE: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_REDIRECT_URI: string;
    GOOGLE_AUTH_SCOPE: string;
    GOOGLE_AUTH_HOSTED_DOMAIN: string;
    GOOGLE_API_AUDIENCE: string;
    FRONTEND_URL: string;
    NOSQL_DB_URL: string;
    NOSQL_DB_DATABASE: string;
    NOSQL_DB_PASSWORD: string;
    NODE_ENV: string;
}
