# Microfrontend Orchestrator AI Coding Instructions

> `.cursorrules` in the repo root is the source of truth. This file mirrors it - when they disagree, `.cursorrules` wins, and any change here should be made there too.

This is a **monorepo** microfrontend orchestrator service with a Fastify backend and React frontend for managing microfrontends across multiple environments.

## Architecture Overview

**Project Structure**:
- **📦 Monorepo**: pnpm workspace with centralized dependency management
- **⚡ Turbo**: Build system for optimized task orchestration and caching
- **🎨 Biome**: Unified linting and formatting across all packages
- **🪝 Lefthook**: Git hooks for automated code quality checks
- **📋 Commitlint**: Enforced conventional commit messages

**Backend (Fastify + TypeScript)**:
- **Layered Architecture**: Models → Services → Controllers → Plugins
- **Auto-loading**: Controllers and plugins auto-loaded from their directories
- **Authorization**: Project-scoped access control via `BaseAuthorizedService`
- **Multi-auth**: Supports local JWT, Auth0, Google OAuth, Azure EntraID
- **Database**: MongoDB with Mongoose, Redis for caching

**Frontend (React + TypeScript)**:
- **UI**: `@mfe-orchestrator/design-system` components with Tailwind CSS
- **State**: React Query for server state, Zustand for client state
- **Routing**: React Router with lazy-loaded pages
- **Forms**: react-hook-form with TypeScript validation
- **i18n**: Complete internationalization with react-i18next

**Key Features**:
- **Canary deployments**: `CanaryType` (`RANDOM` | `ON_SESSION` | `ON_USER`, default `ON_SESSION`) and `CanaryDeploymentType` (`BASED_ON_VERSION` | `BASED_ON_URL`) in `backend/src/models/MicrofrontendModel.ts`; enrolled canary users in `DeploymentCanaryUsersController.ts`. See https://mfe-orchestrator.dev/documentation/docs/microfrontends/canary-releases
- **Federation integration**: `FederationIntegrationService` replaced the old host injection, which is gone. See https://mfe-orchestrator.dev/documentation/docs/integration/overview
- **Environment-free serving**: manifest, global variables and microfrontend config are served both with an environment slug and without it, via the `auto/:projectId` route forms (`ServeController.ts`)
- **Builds**: build pipeline pages and API. See https://mfe-orchestrator.dev/documentation/docs/deployments/build-status

## Key Patterns & Conventions

### Backend Service Pattern
Services extend `BaseAuthorizedService` and receive `databaseUser` in constructor:
```typescript
export class ProjectService extends BaseAuthorizedService {
    constructor(user?: IUser) {
        super(user)
    }
    
    async findMine(userId: string) {
        await this.ensureAccessToProject(projectId)  // Authorization built-in
        // Business logic here
    }
}
```

### Backend Controller Pattern
Controllers are auto-loaded and access user via `request.databaseUser`:
```typescript
export default async function projectController(fastify: FastifyInstance) {
    fastify.get("/projects/mine", async (request, reply) => {
        const projects = await new ProjectService(request.databaseUser).findMine(request.databaseUser._id)
        return reply.send(projects)
    })
}
```

### Frontend Data Fetching Pattern
Always wrap page components with `ApiStatusHandler` for loading/error states:
```tsx
const dataQuery = useQuery({
  queryKey: ['projects'],
  queryFn: () => projectApi.getMine(),
});

return (
  <ApiStatusHandler queries={[dataQuery]}>
    {/* Your component content */}
  </ApiStatusHandler>
);
```

### Frontend Navigation Pattern
When adding new pages:
1. Create lazy-loaded component in `src/pages/`
2. Add route in `Routes.tsx` 
3. Add navigation link in sidebar components
4. Add i18n strings in `public/locales/`

## Project Structure

### Backend Key Directories
- `src/controller/` - Auto-loaded API route handlers
- `src/service/` - Business logic extending `BaseAuthorizedService`
- `src/models/` - Mongoose schemas with TypeScript interfaces
- `src/plugins/` - Auto-loaded Fastify plugins (order matters)
- `src/errors/` - Custom error classes for different scenarios

### Frontend Key Directories  
- `src/pages/` - All page components (lazy-loaded), 17 feature directories including `builds`, `profile`, `dependencies`, `integration`, `templates-library`
- `src/components/` - Reusable UI components
- `src/components/ui/` - Local leftovers only (`DeleteConfirmationDialog`, `Sidebar`); shared UI lives in `@mfe-orchestrator/design-system`
- `src/store/` - Zustand stores for global state
- `src/hooks/` - Custom hooks and API functions

## Authentication & Authorization

**Multi-provider Auth**: Local JWT, Auth0, Google OAuth, Azure EntraID, API keys
**Project-scoped Access**: Users have roles within specific projects
**Authorization Checks**: Built into `BaseAuthorizedService` methods:
- `ensureAccessToProject(projectId)`
- `ensureAccessToEnvironment(environmentId)` 
- `ensureAccessToDeployment(deploymentId)`

## Development Workflows

**Monorepo Commands**:
```bash
# Development
pnpm dev              # Start backend and frontend (turbo)

# Building
pnpm build            # Build all packages

# Code Quality
pnpm lint             # Lint all packages with Biome
pnpm lint:imports     # Remove unused imports repo-wide
pnpm format           # Format all packages with Biome
pnpm typecheck        # TypeScript check for all packages

# Testing
pnpm test             # Unit tests in all packages
pnpm test:e2e         # Playwright end-to-end suite
```

There are no per-package `dev:*` / `build:*` scripts - turbo fans the root scripts out to every workspace package (`frontend`, `backend`, `e2e`).

**Local Development**:
```bash
# Setup
pnpm install          # Install dependencies for all packages
cd docker-local && docker compose -f docker-compose-development.yaml up -d

# Start development
pnpm dev              # Starts both backend and frontend
```

**Environment Variables**: Set in `.env` file in backend directory (see README.md for full list)

## Common Implementation Patterns

**Backend Model**: Always use timestamps and export both model and interface:
```typescript
export interface IProject extends Document<ObjectId> {
    name: string
    createdAt: Date
    updatedAt: Date
}

const projectSchema = new Schema<IProject>({
    name: { type: String, required: true }
}, { timestamps: true })

const Project = mongoose.model<IProject>("Project", projectSchema)
export default Project
```

**Frontend Toast Notifications**:
```typescript
const notifications = useToastNotificationStore();
notifications.showSuccessNotification({message: "Success!"});
notifications.showErrorNotification({message: "Error occurred"});
```

**Frontend Form Pattern**:
```typescript
const form = useForm<FormData>({
  resolver: zodResolver(schema),
});
// Use TextField.rhf, SelectField.rhf from src/components/input/
```

## Critical Rules

1. **Monorepo Structure**: Use workspace-level commands (`pnpm dev`, `pnpm build`, etc.)
2. **Code Quality**: Use Biome for linting/formatting (`pnpm lint`, `pnpm format`)
3. **Authorization**: Always use service methods for database operations (never direct model access in controllers)
4. **Error Handling**: Use specific error classes from `src/errors/` 
5. **UI Components**: Import from `@mfe-orchestrator/design-system` before creating new ones; do not add to `src/components/ui/`
6. **Icons**: Only use lucide-react icons
7. **Routing**: Use React Router (NOT Next.js router)
8. **Package Manager**: Use pnpm for all dependencies
9. **Commits**: Follow Conventional Commits specification (enforced by commitlint)
10. **i18n**: Internationalize all user-facing text
11. **Git Hooks**: Lefthook automatically runs checks on commit (lint, format, typecheck)

## File Naming & Organization

- Controllers: `{Entity}Controller.ts` 
- Services: `{Entity}Service.ts`
- Models: `{Entity}Model.ts`
- Pages: `{Feature}Page.tsx` in `src/pages/`
- Components: PascalCase in `src/components/`
- Routes: Add to `Routes.tsx` with lazy loading and `<Suspense>`