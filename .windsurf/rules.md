# Project Rules

**📌 IMPORTANT**: See `.cursorrules` for comprehensive project rules and guidelines.

## Architecture

This is a **monorepo** with:

- **📦 pnpm workspace** with centralized dependency management
- **⚡ Turbo** for optimized builds and task orchestration
- **🎨 Biome** for unified linting and formatting
- **🪝 Lefthook** for git hooks and code quality checks
- Three workspace packages: `frontend`, `backend`, `e2e` (Playwright)

## Key Features

- **Canary deployments**: `CanaryType` (`RANDOM` | `ON_SESSION` | `ON_USER`, default `ON_SESSION`) and `CanaryDeploymentType` (`BASED_ON_VERSION` | `BASED_ON_URL`) in `backend/src/models/MicrofrontendModel.ts`; enrolled canary users in `DeploymentCanaryUsersController.ts`. See https://mfe-orchestrator.dev/documentation/docs/microfrontends/canary-releases
- **Federation integration**: `FederationIntegrationService` replaced the old host injection, which is gone. See https://mfe-orchestrator.dev/documentation/docs/integration/overview
- **Environment-free serving**: manifest, global variables and microfrontend config are served both with an environment slug and without it, via the `auto/:projectId` route forms
- **Pages**: `src/pages/` has 17 feature directories, including `builds` (see https://mfe-orchestrator.dev/documentation/docs/deployments/build-status), `profile`, `dependencies`, `integration`, `templates-library`

## Quick Reference Rules

### Development Commands

```bash
# Use workspace-level commands
pnpm dev              # Start both backend and frontend
pnpm build            # Build all packages
pnpm lint             # Lint with Biome
pnpm format           # Format with Biome
pnpm typecheck        # TypeScript check all packages
```

### Frontend

- Non usare next router - Stiamo usando react con react-router-dom
- Internationalize everything using the **i18n module** and the `public/locales` folder
- Always reuse existing **UI elements** instead of creating new ones from scratch
- For forms, always use **react-hook-form**
- For icons, use only **lucide-react**
- Use every time ui components from `@mfe-orchestrator/design-system`. `/src/components/ui` holds only the local leftovers (`DeleteConfirmationDialog`, `Sidebar`) - do not add to it
- For toast notifications, use:
  ```ts
  import useToastNotificationStore from "@/store/useToastNotificationStore";
  const notifications = useToastNotificationStore();
  notifications.showSuccessNotification({ message: "message" });
  notifications.showErrorNotification({ message: "message" });
  ```
- All pages must be located under `src/pages`
- All components must be located under `src/components`
- The API client is located under `src/hooks/apiClient`
- When creating a page add the link in the sidebar and the route

### API Calls

- Quando hai una api call da fare onLoad della pagina usa `import { useQuery } from '@tanstack/react-query';` e racchiudi tutto il componente in `<ApiStatusHandler queries={[dataQuery]}>...</ApiStatusHandler>`
- Quando usi useQuery non usare onError

### Git Workflow

- **SEMPRE fare pull prima di commit**: `git pull` o `git pull --rebase`
- Usa branch dedicati: `feature/NomeFeature`, `fix/NomeFix`, etc.
- Segui Conventional Commits per i messaggi di commit (enforced by commitlint)
- Commit frequenti con messaggi significativi
- Git hooks automatically run checks (lint, format, typecheck)

---

## Full Documentation

For complete rules, patterns, and guidelines, see `.cursorrules` file in the project root.
