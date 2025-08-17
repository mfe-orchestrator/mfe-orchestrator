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

| Variable | Default Value | Description |
|-----------|---------------|-------------|
| `FRONTEND_URL` | `http://localhost:3000` | URL of the frontend application. |
| `REGISTRATION_ALLOWED` | `false` | If `true`, allows new user registration. |
| `ALLOW_EMBEDDED_LOGIN` | `true` | If `true`, enables the login system within the application. |
| `MICROFRONTEND_HOST_FOLDER`| `/var/microfrontends` | Folder containing the host microfrontends. |
| `NOSQL_DATABASE_URL` | `mongodb://localhost:27017/microfrontend-orchestrator` | MongoDB database connection URL. |
| `REDIS_URL` | `redis://localhost:6379` | Redis server connection URL. |
| `REDIS_PASSWORD` | *(empty)* | Password for Redis access (if set). |
| `EMAIL_SMTP_HOST` | `smtp.example.com` | SMTP server host for sending emails. |
| `EMAIL_SMTP_PORT` | `587` | SMTP server port (e.g., 587 for TLS). |
| `EMAIL_SMTP_SECURE` | `false` | If `true`, uses secure connection (SSL/TLS). |
| `EMAIL_SMTP_USER` | *(empty)* | Username for SMTP authentication. |
| `EMAIL_SMTP_PASSWORD` | *(empty)* | Password for SMTP authentication. |
| `EMAIL_SMTP_FROM` | `no-reply@example.com` | Sender email address. |
| `JWT_SECRET` | `your-secret-key-here` | Secret key for JWT generation and validation. |
| `AUTH0_DOMAIN` | *(empty)* | Auth0 tenant domain. |
| `AUTH0_CLIENT_ID` | *(empty)* | Client ID of the Auth0 application. |
| `AUTH0_AUDIENCE` | *(empty)* | API Audience configured in Auth0. |
| `AUTH0_SCOPE` | `openid profile email` | OAuth scopes (space-separated) |
| `AZURE_ENTRAID_TENANT_ID` | *(empty)* | Azure Entra ID tenant ID. |
| `AZURE_ENTRAID_CLIENT_ID` | *(empty)* | Client ID of the registered Azure application. |
| `AZURE_ENTRAID_CLIENT_SECRET` | *(empty)* | Client secret of the registered Azure application. |
| `AZURE_ENTRAID_REDIRECT_URI` | *(empty)* | Redirect URI for Azure authentication. |
| `AZURE_ENTRAID_AUTHORITY` | `https://login.microsoftonline.com` | Authentication authority URL. |
| `AZURE_ENTRAID_SCOPES` | `openid profile email` | Required scopes during login. |
| `AZURE_ENTRAID_API_AUDIENCE` | *(empty)* | Protected API identifier in Azure. |
| `GOOGLE_CLIENT_ID` | *(empty)* | Client ID for Google OAuth authentication. |
| `GOOGLE_REDIRECT_URI` | *(empty)* | Redirect URI for Google OAuth. |
| `GOOGLE_AUTH_SCOPE` | `https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile` | Required scopes to get Google email and profile. |
| `ALLOWED_ORIGINS` | *(empty)* | List of allowed URLs for cross-origin requests comma separated. |
| `LOG_LEVEL` | `info` *(debug/info/warn/error)* | Logging level. |

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
