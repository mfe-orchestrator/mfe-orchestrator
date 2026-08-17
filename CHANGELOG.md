# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Marketing Consent On The Profile Page**: The consent could only be given at registration, and the `PUT /api/users/marketing-consent` endpoint that changes it had no interface calling it. The profile page now carries the consent checkbox, showing the date it was given and clearing it on withdrawal, and appears only where `MARKETING_OPT_IN_ENABLED` is on — the same condition as the registration checkbox

### Fixed

- **Switching Tab On The Microfrontend Page Did Nothing**: The panels are mounted with `forceMount` so the form keeps its values across tabs, but Radix then stops applying `hidden` — all four panels rendered stacked in a column and clicking a tab only moved the highlight. `TabsContent` in the design system now hides inactive panels by `display`, so the fields stay registered. Released as `@mfe-orchestrator/design-system@1.4.2`

### Changed

- **Fourteen More Components Come From The Design System**: `DangerZone` and `DangerZoneRemoveMicrofrontend` were two ~120-line files that were 95% character-identical, copy-pasted dead code included; the framed table with its tinted header row was rewritten in seven pages; eight section headings had drifted into three different weights and margins. `@mfe-orchestrator/design-system@1.5.0` adds `DangerZoneCard`, `ConfirmByTypingDialog`, `SearchInput`, `SectionHeader`, `AddTile`, `IconTile`, `Meter`, `ColorSwatch`, `StatTile`, `NumberedSteps`, `DescriptionList`, `CopyableValue` and `SelectControl`, plus a `loading` state on `Button` and `framed`/`scroll` on `Table`. Forty-three files lost a net 270 lines. Several fixes ride along: the typed confirmation in both danger zones never reset, so cancelling and reopening the dialog left the confirm button already unlocked; the numbered setup steps on the Azure and GitLab pages used raw palette colours with no dark-mode variant; one of the two canary progress bars carried no `role` or `aria-value*`; the search field in the repository import dialog was announcing the microfrontend dashboard's label; the five hand-written select labels were never associated with their control; the project id and slug in the settings page emitted a literal `false` CSS class and were never actually monospaced; and the `accent` icon tone resolved to a near-white violet, which made the api-keys icon almost invisible in light theme

- **Empty States, Code Blocks And Copy Buttons Come From The Design System**: The same three patterns were reimplemented at every call site, and had drifted apart — the empty blocks used seven different vertical paddings, five icon treatments and three text tokens for the same message, and the copy buttons disagreed on whether copying gives any feedback at all (the project id button showed none, the API key one showed a check that never reset). `@mfe-orchestrator/design-system@1.4.1` now provides `EmptyState`, `EmptyStateRow`, `CodeBlock` and `CopyButton`, and twenty-two call sites were moved onto them. The empty-state title is a real heading with a configurable level instead of bold text, the copy confirmation is announced through a live region rather than a silent icon swap, and the install and configuration snippets on the integration page can finally be copied. Some blocks change size slightly where the shared scale differs from what they had

- **Deployable Infrastructure Pinned To 3.1.0**: The Compose file, the Terraform module and the Helm chart named `2.3.0`, so a fresh installation came up a major version behind — without the builds page, the canary strategies or the marketing opt-in. All three now name `3.1.0`, the chart version was bumped to `0.1.2`, and MongoDB and Redis are pinned to `mongo:8.0` and `redis:8-alpine` instead of floating on `latest` and `alpine`
- **Helm Values Aligned With The Configuration Schema**: `values.yaml` exposed four settings the backend never reads — `HOST`, `LOG_LEVEL`, `AZURE_ENTRAID_CLIENT_SECRET` and the `NOSQL_DB_*` aliases — and was missing three it does: `MARKETING_OPT_IN_ENABLED`, `MARKETING_OPT_IN_VERSION` and `NPM_REGISTRY_URL`, so the registration consent could not be turned on through the chart at all. The install notes no longer accept `NOSQL_DB_URL` in place of `NOSQL_DATABASE_URL`, which would have suppressed the warning while the application failed to reach the database

### Documentation

- [Build status](https://mfe-orchestrator.dev/documentation/docs/deployments/build-status) — what the builds page shows, how the run status is read from GitHub Actions, GitLab pipelines and Azure DevOps, the 15-second poll behind the live stream, and `GET /api/builds` with `GET /api/builds/stream`
- [Canary releases](https://mfe-orchestrator.dev/documentation/docs/microfrontends/canary-releases) — the three canary strategies, how the decision is pinned into the served URL, enrolled users and their carry-over across a new deployment, and the boot migration of the legacy values
- [Host integration](https://mfe-orchestrator.dev/documentation/docs/integration/overview) — wiring a host application to the orchestrator: the serve endpoints, the generated configuration per stack, the bootstrap and the global variables script
- **README**: the environment variable table was reconciled with the configuration schema — four defaults were wrong (`REGISTRATION_ALLOWED`, `MICROFRONTEND_HOST_FOLDER`, `NODE_ENV`, `JWT_SECRET`), `LOG_LEVEL` and `AZURE_ENTRAID_CLIENT_SECRET` are read by nothing and were removed, and thirteen variables that the backend does read were missing, the marketing opt-in flags among them. The development URLs, the required Node version and the `pnpm` script list were corrected as well
- **Existing pages**: `TELEMETRY.md` states the failure logging and the `NODE_ENV` precedence accurately, `DEPENDENCIES.md` names the endpoints that actually take a `branches` map and carries the `/api` prefix, and `REPOSITORY-IMPORT.md` no longer claims that already-imported repositories show their slug or that a selection survives a partial failure
- **Agent instruction files**: `.cursorrules`, `.github/copilot-instructions.md` and `.windsurf/rules.md` no longer point at shadcn/ui in place of `@mfe-orchestrator/design-system`, no longer list four `pnpm` scripts that do not exist, and name the current local ports

---

## [3.1.0] - 2026-08-16

### Fixed

- **Enrolled Users Survive A New Deployment**: Enrolment is stored per deployment, so a fresh deployment started with nobody on the canary and every enrolled user silently dropped back to the stable version. The rows of the deployment being replaced are now copied into the new one, inside the transaction that creates it, scoped rows included
- **Concurrent Canary User Writes**: The batch canary user writes ran through `Promise.all`. A transaction runs every operation on a single session, and MongoDB refuses two commands carrying the same transaction number at once — which is exactly what firing them concurrently did as soon as more than one id was passed. `setCanaryUserMultipleRaw` and `createMultipleRaw` now await in sequence

### Changed

- **Microfrontend Card**: The canary type and deployment type badges were dropped from the card, leaving the percentage bar and the canary version
- **Image Builds**: The pnpm update notifier is silenced in both Docker images, so it no longer writes into the build output

### Tests

- **Profile Page**: The profile page is covered end to end — the personal data form, and avatar upload, replacement and removal with the size and type rules — with the avatar rules also covered on `UserService`. The profile components carry the test ids the suite selects on

---

## [3.0.0] - 2026-08-16

### Added

- **Build Screen**: A dedicated builds page lists the pipeline runs of every microfrontend of the project and streams their status live over server-sent events, with the run history and a status badge per microfrontend. The status is read through the provider each microfrontend is hosted on — GitHub Actions, GitLab pipelines and Azure DevOps builds — and exposed by `GET /api/builds`
- **User Profile Page**: A profile page where the logged in user edits their personal data and uploads, replaces or removes their avatar. The avatar is stored server-side and is what the sidebar user button renders
- **Canary Strategies**: The canary is no longer a single on/off split. A microfrontend picks between a random percentage, a sticky per-session assignment, and an explicit list of enrolled users, and the release settings moved into their own section of the microfrontend form. Existing microfrontends are migrated on boot
- **Bulk Canary User Actions**: Canary users can be enabled, disabled or removed in bulk from the selection in the canary users table
- **Global Variables Script**: The generated integration writes a global variables script straight into the host document, addressed per project, so a host picks up the environment variables of the project without wiring them by hand. The integration dialog generates and previews it
- **Marketing Opt-In At Registration**: The registration form collects a marketing consent, stored on the user and gated by configuration, so it only shows where the deployment enables it
- **Last Login Tracking**: The user record keeps the date of the last login, updated when a token is issued
- **Per-Page Document Head**: Every page sets its own document title through a `PageHead` component, the authentication and single-page layouts included
- **Logged In User In The Bootstrap**: The generated bootstrap names the logged in user, so a host can read it without an extra call
- **Sidebar Logo**: The sidebar header shows the MFE Orchestrator logo

### Changed

- **Generated Configuration Carries Its Origin**: `backendUrl` and `projectId` are written into the generated configuration, so a served microfrontend knows which backend and project it belongs to without being told
- **Microfrontends Table**: The host is rendered as an icon instead of a text column and the canary cell has room for the strategy it now describes
- **Microfrontend Graph Nodes**: The nodes of the microfrontend flow were redrawn into their own component
- **Error Handling**: The unregistered error handler was dropped and the not-found errors became typed per entity (`EnvironmentNotFoundError`, `ProjectNotFoundError`), so the plugin answers with the right status
- **Lint**: Unused-import removal is enforced across the whole repo, hooks included

### Fixed

- **Serving On The Resolved Environment**: Microfrontend files are served on the environment actually resolved from the request instead of a stale one
- **Federated Access Decision**: A federated access is decided from the token instead of from a request header
- **Scoped Package Registry URL**: The whole npm package name is encoded in the registry URL, so scoped packages resolve
- **Mail Fixture Decoding**: The ampersand entity is decoded last in the end-to-end mail fixture

### CI

- The monorepo build no longer runs on pull requests
- The actions pinned by the workflows were upgraded

---

## [2.3.0] - 2026-08-11

### Added

- **Bulk Repository Import**: From the microfrontends dashboard, an "Import from repository" action lists every repository reachable through a code repository connection (GitHub account/organization, GitLab group, Azure DevOps project) and creates a microfrontend for each selected one. Repositories already linked to a microfrontend are flagged and skipped, slug collisions get a numeric suffix, and each import is reported individually so one failing repository does not abort the batch. Backed by `GET /api/repositories/:codeRepositoryId/importable-repositories` and `POST /api/repositories/:codeRepositoryId/import`, documented in [Import repositories as microfrontends](https://mfe-orchestrator.dev/documentation/docs/repositories/import-microfrontends)
- **Module Federation Integration**: One button wires module federation into every microfrontend of a project, and the console generates the integration instructions for the stack each microfrontend actually uses instead of a single generic snippet
- **Stack Detection**: Every microfrontend remembers the stack it was detected on, which is what lets the generated configuration match its build tool
- **Cross-Repository Dependency Analysis**: Scans the repositories of a project through the provider API, compares the declared ranges against the npm registry and rewrites the misaligned `peerDependencies` on a dedicated branch. Each microfrontend can be compared on a branch of its own. Documented in [Dependency analysis](https://mfe-orchestrator.dev/documentation/docs/repositories/dependency-analysis)
- **Server-Side Canary Resolution**: The canary version is resolved on the backend and pinned in the URL, the per-user enrolment is reachable, and the deployment cards show the split each microfrontend is serving
- **Environment-Free Serving**: The manifest, the global variables and the microfrontend configuration are served without an environment in the URL, so one build reaches every environment
- **Dedicated Serve CORS Allow-List**: `ALLOWED_SERVE_ORIGINS` applies its own list to the `/serve/*` endpoints, falling back to `ALLOWED_ORIGINS`
- **Configurable Rate Limit**: The per-IP request ceiling is configurable instead of hardcoded
- **Design System Adoption**: The frontend renders through `@mfe-orchestrator/design-system`, sidebar included, in place of the local UI components
- **Secret Visibility Toggle**: Secret values can be revealed and hidden again in the forms that hold them
- **Clone With IntelliJ**: The clone popover of a microfrontend offers the JetBrains protocol next to HTTPS and SSH
- **End-To-End Coverage**: Playwright suites for login, project creation, project invitations, and CRUD of environments, API keys and storage providers

### Changed

- **Repository Listing Pagination**: `GithubClient.getRepositories` and `GitlabClient.getRepositoriesByGroupId` now walk every page instead of returning only the provider's first page (30 repositories on GitHub, 20 on GitLab), so repository pickers and the bulk import see the complete list
- **Host Injection Dropped**: The old host injection is replaced by the federation integration
- **Client SDK Scope**: The generated configurations and the published package both point at the `mfe-orchestrator-hub` scope
- **Pinned Deployable Infrastructure**: The Compose file, the Terraform module and the Helm chart name the released tag instead of `latest`

### Fixed

- **Invalid Object Ids**: An invalid id is rejected instead of being turned into a fabricated one
- **Request Bodies**: Only JSON bodies are accepted, with multipart scoped to the upload route
- **Generated Bootstrap Snippet**: The environment is optional, and the webpack profiles match the reference templates
- **Members Page Request Loop**: The project members page stops re-requesting in a loop
- **Repository Fetch Loop And 429s**: The repository fetch no longer loops into the rate limiter
- **View Switcher Alignment**: The microfrontends view switcher lines up with the header buttons

### Documentation

- [Import repositories as microfrontends](https://mfe-orchestrator.dev/documentation/docs/repositories/import-microfrontends) — importing repositories as microfrontends, with the API reference
- [Dependency analysis](https://mfe-orchestrator.dev/documentation/docs/repositories/dependency-analysis) — how the dependency scan and the peer dependency alignment work

---

## [2.2.0] - 2026-08-07

### Added

- **Reworked GitHub Connection**: The GitHub code repository connection was updated end to end

### Fixed

- **Self Invitations**: A user can no longer invite themselves to a project
- **Team Mates And i18n**: Missing translations and the team mates screen of the project
- **Login**: A login failure on the embedded provider

---

## [2.1.0] - 2026-08-06

### Added

- **All-in-One Docker Image**: `Dockerfile.all-in-one` builds a single container with the orchestrator, MongoDB (single node replica set, so transactions work), Redis and Nginx. `docker run -p 8080:80 -v mfe-data:/data lory1990/mfe-orchestrator:all-in-one` is a complete installation: no sidecar containers, all the state under `/data`, databases bound to the loopback and a JWT secret generated on first start. Supervisor keeps the four processes alive and takes the container down when one of them cannot start
- **Anonymous Telemetry**: Self-hosted installations send one anonymous ping per day with aggregate counters only (`installationId`, `version`, `nodeVersion`, `projects`, `microfrontends`, `environments`, `users`, `deploymentsLastWeek`). Enabled by default, off with `TELEMETRY_DISABLED=true` or `DO_NOT_TRACK=1`, never sent when `NODE_ENV` is not `prod`. The full payload is disclosed in the startup log, inspectable via `GET /api/telemetry/status` and documented field by field in [docs/TELEMETRY.md](docs/TELEMETRY.md)
- **Helm Chart**: `helm/mfe-orchestrator` installs the orchestrator on Kubernetes, with every environment variable exposed through `values.yaml`, ingress, persistence, probes, autoscaling and secrets kept outside the values file
- **Design System Package**: `@mfe-orchestrator/design-system` is consumed from GitHub Packages
- **New Project Wizard**: Restored and reused on the first run, sharing the storage form and the environment setup with the rest of the console
- **Redesigned Dashboard And Project Picker**: The microfrontends dashboard was redesigned, and the post-login picker shows projects as large tiles while making it clear that the switcher also creates them
- **Drag And Drop Environments**: Environments are reordered by dragging them
- **Clone Urls**: Microfrontends carry their HTTPS and SSH clone urls, offered through a clone popover
- **Apache-2.0 License**: The project is licensed under Apache-2.0

### Changed

- **Transactional Emails**: Aligned with the design system
- **Node 24**: Both the build and the GitHub Actions runners moved to Node 24

### Fixed

- **Telemetry**: The ping always carries a valid installation id and reaches the dedicated telemetry service
- **Translation Cache**: The browser cache of the translation files is busted on release, and the environments screens no longer miss strings
- **Project Users Cache**: Refreshed after sending an invite
- **Docker pnpm Version**: Pinned to the version declared in the workspace `packageManager`

### Documentation

- README rewritten as a landing page

---

## [2.0.0] - 2026-08-04

No changelog was kept for this release. See the
[release notes](https://github.com/mfe-orchestrator/mfe-orchestrator/releases/tag/2.0.0)
and the commits between `1.2.0` and `2.0.0`.

---

## [1.2.0] - 2026-07-14

No changelog was kept for this release. See the commits between `1.0.0` and `1.2.0`.

---

## [1.0.0] - 2025-12-07

### Added

- Microfrontend orchestration hub with JSON-based configuration
- Multi-environment support (DEV, UAT, PROD, etc.)
- Project management with user roles and permissions
- Environment-specific microfrontend configurations
- Deployment management system
- Code repository integration (GitHub, GitLab, Azure DevOps)
- Storage integration (S3, Azure Storage, Google Cloud Storage)
- API key authentication
- User authentication (Local, Auth0, Azure AD, Google OAuth)
- Global environment variables management
- Canary deployment support
- Market/templates library
- Comprehensive error handling
- API documentation with Swagger
- **Monorepo Architecture**: Migrated to pnpm workspace with centralized dependency management
- **Turbo Build System**: Added Turborepo for optimized build and task orchestration
- **Biome Integration**: Replaced ESLint + Prettier with Biome for unified linting and formatting
- **Lefthook Git Hooks**: Migrated from Husky to Lefthook for improved git hook management
- **Commitlint Integration**: Added automated conventional commit validation
- **VSCode Configuration**: Added shared VSCode settings and extensions for team consistency
- **Centralized Configuration**: Unified Biome configuration for consistent code style across packages

### Changed

- **Package Management**: Migrated from individual package management to centralized pnpm workspace
- **Build System**: Replaced individual build scripts with Turbo-powered monorepo builds
- **Code Quality**: Unified linting and formatting across backend and frontend with Biome
- **Git Hooks**: Improved pre-commit hooks with optimized file processing and parallel execution
- **Development Workflow**: Streamlined development setup with workspace-level commands

### Fixed

- **Version Mismatches**: Resolved Fastify and Mongoose interface compatibility issues
- **Dependency Conflicts**: Eliminated duplicate dependencies across packages
- **Code Style Inconsistencies**: Standardized formatting and linting rules project-wide
- **Git Hook Performance**: Optimized hook execution with glob patterns and parallel processing

### Removed

- **Husky**: Replaced with Lefthook for better performance and configuration
- **ESLint + Prettier**: Replaced with Biome for unified tooling
- **Individual pnpm-lock files**: Consolidated to workspace-level dependency management
- **Duplicate configurations**: Removed redundant config files across packages

### Documentation

- README with environment variables
- Cursor rules for development workflow
- Commit conventions documentation
- Security documentation

---

## Versioning

We use [SemVer](http://semver.org/) for versioning. Given a version number MAJOR.MINOR.PATCH, we increment the:

- **MAJOR** version when we make incompatible API changes
- **MINOR** version when we add functionality in a backwards-compatible manner
- **PATCH** version when we make backwards-compatible bug fixes

### Commit Type to Version Mapping

- **`feat`** commits → **MINOR** version bump
- **`fix`** commits → **PATCH** version bump
- **BREAKING CHANGE** → **MAJOR** version bump

## Legend

- **Added** - New features
- **Changed** - Changes in existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security improvements

## How to Update This Changelog

This changelog is maintained manually but can be generated automatically using tools that parse Conventional Commits. When making changes:

1. Add your changes under the appropriate section
2. Follow the format: **"- Brief description of change (#PR number)"**
3. Group changes by type (Added, Changed, Fixed, etc.)
4. Place the most recent changes at the top of each section
5. Link to related issues or pull requests when applicable

### Example

```markdown
## [1.1.0] - 2024-01-15

### Added

- Dark mode support for the UI (#123)
- Export project configuration as JSON (#124)

### Changed

- Improved deployment performance (#125)

### Fixed

- Resolved authentication token expiration issue (#126)
```

## Automated Changelog Generation

This project can use tools like:

- [standard-version](https://github.com/conventional-changelog/standard-version)
- [semantic-release](https://github.com/semantic-release/semantic-release)
- [release-please](https://github.com/googleapis/release-please)

These tools automatically:

1. Parse Conventional Commits
2. Generate changelog entries
3. Bump version numbers
4. Create git tags
5. Generate release notes

## Release Workflow

1. Merge feature branches into main
2. Generate changelog from commits
3. Bump version according to Conventional Commits
4. Tag release
5. Publish release notes

---

**Note**: This is a living document. As we release new versions, this changelog will be updated to reflect all changes.
