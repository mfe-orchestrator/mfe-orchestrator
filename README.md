# Microfrontend Orchestrator Hub 🏗️

A centralized service for managing and orchestrating microfrontends across multiple environments. 🚀 This project provides a JSON-based configuration system that describes microfrontends, including their versions, and enables independent deployment and management without requiring a complete frontend rebuild.

The service supports multiple environments (DEV, UAT, PROD, etc.) and maintains separate configurations for each environment, allowing for different versions of microfrontends to be deployed in different stages of development. 📦

## Features 🎯

- 📝 JSON-based configuration of microfrontends with version management
- 🌐 Multi-environment support (DEV, UAT, PROD, etc.)
- 🚀 Independent deployment of microfrontends
- 📋 Environment-specific configurations
- 🔌 Integration with various microfrontend technologies (coming soon)

## Planned Integrations 🔍

- [ ] Module Federation
- [ ] micro-lc



## Getting Started

Coming soon 🚧

## Run with docker

Simpy run the `docker-compose.yaml`

```bash
docker compose docker-compose.yaml up -d
```

### Environment variables 🔧

```bash
# Environment
NODE_ENV=development  # development/production
PORT=3000            # Port to listen on

# Database
DATABASE_URL=mongodb://localhost:27017/microfrontend-orchestrator

# Redis (optional)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

# Email Configuration (optional)
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
EMAIL_SMTP_FROM=no-reply@example.com
FRONTEND_URL=http://localhost:3000

# Auth0 Configuration (optional)
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_API_AUDIENCE=
AUTH0_SECRET=

# Azure Entra ID Configuration (optional)
AZURE_ENTRAID_TENANT_ID=
AZURE_ENTRAID_CLIENT_ID=
AZURE_ENTRAID_CLIENT_SECRET=
AZURE_ENTRAID_REDIRECT_URI=
AZURE_ENTRAID_AUTHORITY=https://login.microsoftonline.com
AZURE_ENTRAID_SCOPES=openid profile email
AZURE_ENTRAID_API_AUDIENCE=

# Google Authentication (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_AUTH_SCOPE=https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile

# Fastify Configuration
FASTIFY_LOG_LEVEL=info  # debug/info/warn/error
FASTIFY_TRUST_PROXY=false

# Security
JWT_SECRET=your-secret-key-here
PASSWORD_SALT_ROUNDS=10

# Rate Limiting
RATE_LIMIT_WINDOW_MS=15000
RATE_LIMIT_MAX=100

# CORS
CORS_ORIGINS=*  # Comma-separated list of allowed origins
CORS_METHODS=GET,PUT,POST,DELETE

# Helmet Security Headers
HELMET_CSP=true
HELMET_DNS_PREFETCH_CONTROL=true
HELMET_REFERRER_POLICY=true

# Microfrontend Configuration
MF_BASE_URL=/mf  # Base URL for microfrontend routes
MF_CACHE_TTL=3600  # Cache TTL in seconds

# Auth0 Integration (if using Auth0)
AUTH0_DOMAIN=your-auth0-domain
AUTH0_AUDIENCE=your-auth0-audience
AUTH0_CLIENT_ID=your-client-id
```

### Installation 🛠️

1. Clone the repository 📝
2. Install dependencies: 📦
   ```bash
   pnpm install
   ```
3. Configure environment variables in the .env file 🔧
4. Start the development server: 🚀
   ```bash
   pnpm dev
   ```

## Contributing 🤝

1. Fork the repository 🍴
2. Create your feature branch (`git checkout -b feature/AmazingFeature`) 🌱
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`) ✍️
4. Push to the branch (`git push origin feature/AmazingFeature`) ⬆️
5. Open a Pull Request 🔗

## License

ISC

## Acknowledgments

- Inspired by modern microfrontend architectures and orchestration patterns
- Built with Fastify and TypeScript for robust and scalable backend services
- Integrating with multiple microfrontend technologies for maximum flexibility