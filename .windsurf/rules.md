# Project Rules

**📌 IMPORTANT**: See `.cursorrules` for comprehensive project rules and guidelines.

## Architecture

This is a **monorepo** with:

- **📦 pnpm workspace** with centralized dependency management
- **⚡ Turbo** for optimized builds and task orchestration
- **🎨 Biome** for unified linting and formatting
- **🪝 Lefthook** for git hooks and code quality checks

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
- Use every time ui components from `/src/components/ui`
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
