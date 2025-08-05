# Microfrontend Orchestrator Hub 🏗️

A centralized service for managing and orchestrating microfrontends across multiple environments. 🚀 This project provides a JSON-based configuration system that describes microfrontends, including their versions, and enables independent deployment and management without requiring a complete frontend rebuild.

The service supports multiple environments (DEV, UAT, PROD, etc.) and maintains separate configurations for each environment, allowing for different versions of microfrontends to be deployed in different stages of development. 📦

## Features 🎯

- 📝 JSON-based configuration of microfrontends with version management
- 🌐 Multi-environment support (DEV, UAT, PROD, etc.)
- 🚀 Independent deployment of microfrontends
- 📋 Environment-specific configurations
- 🔌 Integration with various microfrontend technologies (coming soon)

## Run with docker

Simpy run the `docker-compose.yaml`

```bash
docker compose up -d
```

## Run with terraform (open tofu)
You have a terraform template in the `terraform` folder. You can run it with:

```bash
cd terraform
terraform init
terraform apply
```

### Environment variables 🔧

```bash
# Environment
NODE_ENV=development  # development/production
PORT=3000            # Port to listen on

# Database
NOSQL_DATABASE_URL=mongodb://localhost:27017/microfrontend-orchestrator

# Redis (optional)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=

#Registration control
REGISTRATION_ALLOWED=true
ALLOW_EMBEDDED_LOGIN=true

# Email Configuration (optional)
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=
EMAIL_SMTP_PASSWORD=
EMAIL_SMTP_FROM=no-reply@example.com

## Frontend url to send email
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

# Auth0 Integration (if using Auth0)
AUTH0_DOMAIN=your-auth0-domain
AUTH0_AUDIENCE=your-auth0-audience
AUTH0_CLIENT_ID=your-client-id
```

### Local Installation for development 🛠️

1. Clone the repository 📝
1. Make sure you have `pnpm` and `docker` installed
1. Run docker compose
```bash
   cd ./docker-local
   docker compose -f docker-compose-development.yaml up -d
```
1. Go to frontend folder and install dependencies: 📦
```bash
   cd ./frontend
   pnpm install
   ```   
1. Run frontend
```bash
   pnpm run dev
   ```
1. In a new terminal go to backend and install dependencies: 📦
```bash
   cd ../backend
   pnpm install
   ```
1. Create `.env` file in `./backend` with the following data
```bash
NOSQL_DATABASE_URL=mongodb://root:example@localhost:27017/admin
REDIS_URL=redis://localhost:6379

REGISTRATION_ALLOWED=true
ALLOW_EMBEDDED_LOGIN=true
```
1. Configure environment variables in the .env file using the one in this readme 🔧
1. Run backend
```bash
   pnpm run dev
   ```

## Contributing 🤝

1. Fork the repository 🍴
2. Create your feature branch (`git checkout -b feature/AmazingFeature`) 🌱
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`) ✍️
4. Push to the branch (`git push origin feature/AmazingFeature`) ⬆️
5. Open a Pull Request 🔗

## License

ISC

## Planned Integrations 🔍

- [ ] Module Federation
- [ ] micro-lc
