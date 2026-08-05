# Microfrontend Orchestrator

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
  - [Run everything in a single container 📦](#run-everything-in-a-single-container-)
  - [Run with Terraform (OpenTofu)](#run-with-terraform-opentofu)
  - [Run on Kubernetes with Helm ⎈](#run-on-kubernetes-with-helm-)
  - [Environment variables 🔧](#environment-variables-)
  - [Anonymous telemetry 📡](#anonymous-telemetry-)
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
- **[Anonymous telemetry](docs/TELEMETRY.md)** - What the daily ping contains and how to turn it off

## Run with Docker

Simply run the `docker-compose.yaml`

```bash
docker compose up -d
```

## Run everything in a single container 📦

If you do not want to run MongoDB and Redis yourself, use the **all-in-one**
image: it contains the orchestrator, MongoDB, Redis and Nginx. One container,
one volume, nothing else to start.

```bash
docker run -d --name mfe-orchestrator --restart unless-stopped \
  -p 8080:80 -v mfe-data:/data lory1990/mfe-orchestrator:all-in-one
```

Open http://localhost:8080 and create the first user. That is all.

What you should know about it:

- **Everything persistent lives in `/data`**: database (`/data/db`), Redis dump
  (`/data/redis`), uploaded microfrontends (`/data/microfrontends`) and the JWT
  secret (`/data/secrets`). Mount that single volume and the installation
  survives an image upgrade.
- **The JWT secret is generated on the first start** and kept in the volume, so
  tokens are not signed with a well known key. Pass `JWT_SECRET` yourself if you
  prefer to manage it.
- **MongoDB and Redis only listen on the loopback of the container**: they are
  reachable by the backend and by nobody else, so there is no database port to
  firewall and no default password to change. Only port 80 is published.
- **MongoDB runs as a single node replica set** (`MONGO_REPLICA_SET=rs0`), which
  is what makes transactions available to the backend. Set the variable to an
  empty string to run a plain standalone MongoDB instead.
- Every [environment variable](#environment-variables-) of the table below works
  here too, for example
  `-e REGISTRATION_ALLOWED=true -e FRONTEND_URL=https://mfe.example.com`.
- The four processes are supervised: they are restarted when they crash and, if
  one of them cannot start at all, the container exits instead of pretending to
  be healthy. Logs of all of them are in `docker logs mfe-orchestrator`, and
  `docker exec mfe-orchestrator supervisorctl status` shows their state.

Prefer a compose file? A single service is enough:

```yaml
services:
  mfe-orchestrator:
    image: lory1990/mfe-orchestrator:all-in-one
    restart: unless-stopped
    ports:
      - "8080:80"
    volumes:
      - mfe-data:/data

volumes:
  mfe-data:
```

To build the image yourself, compile the workspace first, exactly like the
standard image does:

```bash
pnpm install && pnpm build
docker build -f Dockerfile.all-in-one -t mfe-orchestrator:all-in-one .
```

> The all-in-one image trades isolation for simplicity: a single container means
> a single failure domain and no way to scale a service on its own. For
> production installations, or whenever you already run a managed MongoDB or
> Redis, use the `docker-compose.yaml` above.

## Run with Terraform (OpenTofu)

You have a terraform template in the `terraform` folder. You can run it with:

```bash
cd terraform
terraform init
terraform apply
```

## Run on Kubernetes with Helm ⎈

The chart lives in [`helm/mfe-orchestrator`](helm/mfe-orchestrator/README.md).

```bash
helm install mfe-orchestrator ./helm/mfe-orchestrator \
  --namespace mfe-orchestrator --create-namespace \
  --set env.NOSQL_DATABASE_URL="mongodb://root:example@mongodb:27017" \
  --set env.REDIS_URL="redis://redis:6379" \
  --set envSecrets.JWT_SECRET="$(openssl rand -hex 32)"
```

To distribute it as a package:

```bash
helm package helm/mfe-orchestrator      # -> mfe-orchestrator-<version>.tgz
helm install mfe-orchestrator mfe-orchestrator-0.1.0.tgz -f my-values.yaml
```

Every [environment variable](#environment-variables-) of the table below is
configurable from `values.yaml`: plain ones under `env` (rendered into a
ConfigMap), sensitive ones under `envSecrets` (rendered into a Secret), and both
maps accept any additional variable you need.

```yaml
env:
  FRONTEND_URL: https://console.example.com
  REGISTRATION_ALLOWED: false
  NOSQL_DATABASE_URL: mongodb://root:example@mongodb:27017
  REDIS_URL: redis://redis:6379
envSecrets:
  JWT_SECRET: a-random-32-bytes-string
```

The chart also handles ingress, persistence of the uploaded microfrontends,
probes on `/api/echo`, autoscaling and secrets kept outside of `values.yaml`
(`existingSecret`, `extraEnv`). MongoDB and Redis are not deployed by the chart:
point it at your own instances. See the
[chart README](helm/mfe-orchestrator/README.md) for the full reference.

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
| `TELEMETRY_DISABLED`                   | _(empty)_                                                                                         | If `true`, turns off the anonymous telemetry ping.              |
| `TELEMETRY_ENABLED`                    | _(empty)_                                                                                         | Explicit telemetry override, wins over every other switch.      |
| `DO_NOT_TRACK`                         | _(empty)_                                                                                         | If `1`, turns off the anonymous telemetry ping.                 |
| `TELEMETRY_ENDPOINT`                   | `https://telemetry.mfe-orchestrator.dev/api/telemetry/self-hosted`                               | Where the anonymous telemetry ping is sent.                     |
| `TELEMETRY_INTERVAL_HOURS`             | `24`                                                                                              | Hours between two telemetry pings (minimum `1`).                |

## Anonymous telemetry 📡

Self-hosted installations send **one anonymous ping per day**, so that we know how many installations are alive and on which version. It is **on by default** and contains only aggregate counters:

```json
{
  "installationId": "3f2b9c14-6d8e-4a17-9f0b-2c5d7e81a4b6",
  "version": "1.0.0",
  "nodeVersion": "24.4",
  "projects": 2,
  "microfrontends": 12,
  "environments": 3,
  "users": 4,
  "deploymentsLastWeek": 5
}
```

That is the whole payload: no names, no emails, no URLs, no hostnames, no project or microfrontend content. It is never sent when `NODE_ENV` is not `prod`, so development and CI runs are not counted.

To turn it off:

```yaml
TELEMETRY_DISABLED: "true"
```

Every start logs what is sent and how to disable it, and `GET /api/telemetry/status` shows the exact payload of your installation before it leaves. Full details, field by field, in **[docs/TELEMETRY.md](docs/TELEMETRY.md)**.

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

Licensed under the [Apache License, Version 2.0](LICENSE).

## Planned Integrations 🔍

- [ ] Module Federation
- [ ] micro-lc
