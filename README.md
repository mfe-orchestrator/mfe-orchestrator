# Microfrontend Orchestrator Hub 🏗️

A centralized service for managing and orchestrating microfrontends across multiple environments. 🚀 This project provides a JSON-based configuration system that describes microfrontends, including their versions, and enables independent deployment and management without requiring a complete frontend rebuild.

The service supports multiple environments (DEV, UAT, PROD, etc.) and maintains separate configurations for each environment, allowing for different versions of microfrontends to be deployed in different stages of development. 📦

## 🏗️ Architecture

This project uses a **monorepo architecture** with the following structure:

- **📦 Monorepo**: Managed with pnpm workspaces for centralized dependency management
- **⚡ Turbo**: Build system for optimized task orchestration and caching
- **🎨 Biome**: Unified linting and formatting across all packages
- **🪝 Lefthook**: Git hooks for automated code quality checks
- **📋 Commitlint**: Enforced conventional commit messages

### Backend (Fastify + TypeScript)

- **Layered Architecture**: Models → Services → Controllers → Plugins
- **Auto-loading**: Controllers and plugins auto-loaded from their directories
- **Authorization**: Project-scoped access control via `BaseAuthorizedService`
- **Multi-auth**: Supports local JWT, Auth0, Google OAuth, Azure EntraID
- **Database**: MongoDB with Mongoose, Redis for caching

### Frontend (React + TypeScript)

- **UI**: shadcn/ui components with Tailwind CSS
- **State**: React Query for server state, Zustand for client state
- **Routing**: React Router with lazy-loaded pages
- **Forms**: react-hook-form with TypeScript validation
- **i18n**: Complete internationalization with react-i18next

## Table of Contents 📑

- [Microfrontend Orchestrator Hub 🏗️](#microfrontend-orchestrator-hub-️)
  - [🏗️ Architecture](#️-architecture)
    - [Backend (Fastify + TypeScript)](#backend-fastify--typescript)
    - [Frontend (React + TypeScript)](#frontend-react--typescript)
  - [Table of Contents 📑](#table-of-contents-)
  - [Features 🎯](#features-)
  - [Documentation 📚](#documentation-)
  - [Run with Docker](#run-with-docker)
  - [Run with Terraform (OpenTofu)](#run-with-terraform-opentofu)
  - [Environment variables 🔧](#environment-variables-)
  - [Local Installation for development 🛠️](#local-installation-for-development-️)
    - [Prerequisites](#prerequisites)
    - [Quick Start](#quick-start)
    - [Available Commands](#available-commands)
    - [Development URLs](#development-urls)
  - [Contributing 🤝](#contributing-)
    - [Development Workflow](#development-workflow)
    - [Code Quality](#code-quality)
    - [Development Guidelines](#development-guidelines)
  - [License](#license)
  - [Planned Integrations 🔍](#planned-integrations-)

## Features 🎯

- 📝 JSON-based configuration of microfrontends with version management
- 🌐 Multi-environment support (DEV, UAT, PROD, etc.)
- 🚀 Independent deployment of microfrontends
- 📋 Environment-specific configurations
- 🔌 Integration with various microfrontend technologies (coming soon)

## Documentation 📚

- **[Cursor Rules](.cursorrules)** - Development guidelines and coding standards
- **[Commit Conventions](COMMIT_CONVENTIONS.md)** - Conventional Commits specification
- **[Changelog](CHANGELOG.md)** - Project version history
- **[Security](SECURITY.md)** - Security policy and procedures

## Run with Docker

Simply run the `docker-compose.yaml`

```bash
docker compose up -d
```

## Run with Terraform (OpenTofu)

You have a terraform template in the `terraform` folder. You can run it with:

```bash
cd terraform
terraform init
terraform apply
```

## Environment variables 🔧

| Variable                               | Default Value                                                                                     | Description                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `FRONTEND_URL`                         | `http://localhost:3000`                                                                           | URL of the frontend application.                                |
| `REGISTRATION_ALLOWED`                 | `false`                                                                                           | If `true`, allows new user registration.                        |
| `ALLOW_EMBEDDED_LOGIN`                 | `true`                                                                                            | If `true`, enables the login system within the application.     |
| `MICROFRONTEND_HOST_FOLDER`            | `/var/microfrontends`                                                                             | Folder containing the host microfrontends.                      |
| `NOSQL_DATABASE_URL`                   | `mongodb://localhost:27017/microfrontend-orchestrator`                                            | MongoDB database connection URL.                                |
| `NOSQL_DATABASE_NAME`                  | `microfrontend-orchestrator`                                                                      | MongoDB database name.                                          |
| `NOSQL_DATABASE_USERNAME`              | `root`                                                                                            | MongoDB username.                                               |
| `NOSQL_DATABASE_PASSWORD`              | `example`                                                                                         | MongoDB password.                                               |
| `REDIS_URL`                            | `redis://localhost:6379`                                                                          | Redis server connection URL.                                    |
| `REDIS_PASSWORD`                       | _(empty)_                                                                                         | Password for Redis access (if set).                             |
| `NODE_ENV`                             | `development`                                                                                     | Node.js environment mode (development/production/test).         |
| `EMAIL_SMTP_HOST`                      | `smtp.example.com`                                                                                | SMTP server host for sending emails.                            |
| `EMAIL_SMTP_PORT`                      | `587`                                                                                             | SMTP server port (e.g., 587 for TLS).                           |
| `EMAIL_SMTP_SECURE`                    | `false`                                                                                           | If `true`, uses secure connection (SSL/TLS).                    |
| `EMAIL_SMTP_USER`                      | _(empty)_                                                                                         | Username for SMTP authentication.                               |
| `EMAIL_SMTP_PASSWORD`                  | _(empty)_                                                                                         | Password for SMTP authentication.                               |
| `EMAIL_SMTP_FROM`                      | `no-reply@example.com`                                                                            | Sender email address.                                           |
| `JWT_SECRET`                           | `your-secret-key-here`                                                                            | Secret key for JWT generation and validation.                   |
| `AUTH0_DOMAIN`                         | _(empty)_                                                                                         | Auth0 tenant domain.                                            |
| `AUTH0_CLIENT_ID`                      | _(empty)_                                                                                         | Client ID of the Auth0 application.                             |
| `AUTH0_AUDIENCE`                       | _(empty)_                                                                                         | API Audience configured in Auth0.                               |
| `AUTH0_SCOPE`                          | `openid profile email`                                                                            | OAuth scopes (space-separated)                                  |
| `AZURE_ENTRAID_TENANT_ID`              | _(empty)_                                                                                         | Azure Entra ID tenant ID.                                       |
| `AZURE_ENTRAID_CLIENT_ID`              | _(empty)_                                                                                         | Client ID of the registered Azure application.                  |
| `AZURE_ENTRAID_CLIENT_SECRET`          | _(empty)_                                                                                         | Client secret of the registered Azure application.              |
| `AZURE_ENTRAID_REDIRECT_URI`           | _(empty)_                                                                                         | Redirect URI for Azure authentication.                          |
| `AZURE_ENTRAID_AUTHORITY`              | `https://login.microsoftonline.com`                                                               | Authentication authority URL.                                   |
| `AZURE_ENTRAID_SCOPES`                 | `openid profile email`                                                                            | Required scopes during login.                                   |
| `AZURE_ENTRAID_API_AUDIENCE`           | _(empty)_                                                                                         | Protected API identifier in Azure.                              |
| `GOOGLE_CLIENT_ID`                     | _(empty)_                                                                                         | Client ID for Google OAuth authentication.                      |
| `GOOGLE_REDIRECT_URI`                  | _(empty)_                                                                                         | Redirect URI for Google OAuth.                                  |
| `GOOGLE_AUTH_SCOPE`                    | `https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile` | Required scopes to get Google email and profile.                |
| `ALLOWED_ORIGINS`                      | _(empty)_                                                                                         | List of allowed URLs for cross-origin requests comma separated. |
| `LOG_LEVEL`                            | `info` _(debug/info/warn/error)_                                                                  | Logging level.                                                  |
| `CODE_REPOSITORY_GITHUB_CLIENT_ID`     | _(empty)_                                                                                         | Client ID for GitHub OAuth authentication.                      |
| `CODE_REPOSITORY_GITHUB_CLIENT_SECRET` | _(empty)_                                                                                         | Client secret for GitHub OAuth authentication.                  |

## Local Installation for development 🛠️

### Prerequisites

- Node.js 18+ and pnpm installed
- Docker and Docker Compose

### Quick Start

1. **Clone the repository** 📝

```bash
git clone <repository-url>
cd mfe-orchestrator
```

2. **Install dependencies** (monorepo setup) 📦

```bash
pnpm install
```

3. **Start Docker services** �

```bash
cd docker-local
docker compose -f docker-compose-development.yaml up -d
```

4. **Create environment file** 🔧
   Create `.env` file in `./backend` directory:

```bash
NOSQL_DATABASE_URL=mongodb://root:example@localhost:27018/admin
NOSQL_DATABASE_USERNAME=root
NOSQL_DATABASE_PASSWORD=example
REDIS_URL=redis://localhost:6379

REGISTRATION_ALLOWED=true
ALLOW_EMBEDDED_LOGIN=true
NODE_ENV=development
MICROFRONTEND_HOST_FOLDER=/path/to/your/microfrontends

# Optional: GitHub OAuth for code repository integration
CODE_REPOSITORY_GITHUB_CLIENT_ID=your_github_client_id
CODE_REPOSITORY_GITHUB_CLIENT_SECRET=your_github_client_secret
```

5. **Start development servers** 🚀

```bash
# Start both backend and frontend in development mode
pnpm dev

# Or start them individually:
# Backend only: pnpm dev:backend
# Frontend only: pnpm dev:frontend
```

### Available Commands

The monorepo provides these workspace-level commands:

```bash
# Development
pnpm dev              # Start both backend and frontend
pnpm dev:backend      # Start backend only
pnpm dev:frontend     # Start frontend only

# Building
pnpm build            # Build all packages
pnpm build:backend    # Build backend only
pnpm build:frontend   # Build frontend only

# Code Quality
pnpm lint             # Lint all packages with Biome
pnpm format           # Format all packages with Biome
pnpm typecheck        # TypeScript check for all packages

# Testing
pnpm test             # Run tests in all packages
```

### Development URLs

- **Backend**: `http://localhost:8080`
- **Frontend**: `http://localhost:3000`
- **API Documentation**: `http://localhost:8080/api-docs`

## Contributing 🤝

### Development Workflow

1. **Fork the repository** 🍴
2. **Create your feature branch** 🌱

```bash
git checkout -b feature/AmazingFeature
```

3. **Follow development guidelines** 📋

   - Use conventional commit messages (enforced by commitlint)
   - Code is automatically linted and formatted with Biome
   - Git hooks ensure code quality before commits

4. **Commit your changes** ✍️

```bash
git commit -m 'feat: add some amazing feature'
```

5. **Push to the branch** ⬆️

```bash
git push origin feature/AmazingFeature
```

6. **Open a Pull Request** 🔗

### Code Quality

This project uses automated tools to maintain code quality:

- **🎨 Biome**: Unified linting and formatting
- **🪝 Lefthook**: Git hooks for pre-commit checks
- **📋 Commitlint**: Conventional commit validation
- **⚡ Turbo**: Optimized build pipeline

### Development Guidelines

- Use conventional commits (feat, fix, chore, docs, etc.)
- Write tests for new features
- Ensure TypeScript strict mode compliance
- Update documentation for user-facing changes

## License

ISC

## Planned Integrations 🔍

- [ ] Module Federation
- [ ] micro-lc
