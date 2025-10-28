# Microfrontend Orchestrator AI Coding Instructions

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
- **UI**: shadcn/ui components with Tailwind CSS
- **State**: React Query for server state, Zustand for client state
- **Routing**: React Router with lazy-loaded pages
- **Forms**: react-hook-form with TypeScript validation
- **i18n**: Complete internationalization with react-i18next

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
Always wrap page components with `ApiDataFetcher` for loading/error states:
```tsx
const dataQuery = useQuery({
  queryKey: ['projects'],
  queryFn: () => projectApi.getMine(),
});

return (
  <ApiDataFetcher queries={[dataQuery]}>
    {/* Your component content */}
  </ApiDataFetcher>
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
- `src/pages/` - All page components (lazy-loaded)
- `src/components/` - Reusable UI components
- `src/components/ui/` - shadcn/ui base components
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
5. **UI Components**: Reuse existing shadcn/ui components before creating new ones
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