# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- **The API No Longer Returns The Activation And Reset Tokens**: `toFrontendObject()` stripped the password and the salt but left `activateEmailToken` and `resetPasswordToken` in the object, so `POST /api/users/registration` — a public route — answered with the activation token it had just minted, and every other route that serialises a user did the same with the reset token whenever one was pending: login, profile, the organization and project invitation responses. Both are bearer credentials, and holding one activates the account or changes its password without ever reading the mailbox, which is the whole of what the email verification proves. Anybody could therefore register somebody else's address and activate it from the response body. The two tokens and their expiry dates are now deleted alongside the credentials, in the single method every user response goes through

### Fixed

- **The Password Reset No Longer Claims Success Without SMTP**: `requestPasswordReset()` was the only one of the three email flows that did not ask `canSendEmails()` first. It minted the token, saved it, and only then tried to reach a host that is not configured: the send failed after a credential valid for a full hour had already been written onto the account, where nobody could receive it. Registration and invitations have something to degrade into when SMTP is missing — an account that is simply active — this one has not, so it now refuses before writing anything, with the `EMAIL_NOT_CONFIGURED` business exception the invitation flows already raise. The screen was hiding the failure: it awaited `mutate()`, which returns `void` and swallows the rejection, so "check your email" and the redirect ran whatever the backend answered — for this error and for every other one. It uses `mutateAsync()` now. Business exceptions travel as `{ success: false, error: { code, message } }` while the API client only ever read `responseData.message`, so the toast would have shown the bare axios string: the page keys off the code through the new `errorCodeOf()` helper and translates it

---

## [4.0.0] - 2026-08-27

### Added

- **Organizations As The Tenant Of Projects**: A user can belong to several organizations, a project to only one. Whoever administers the organization (`OWNER`, `ADMIN`) reaches all of its projects, a plain member only the ones they were invited to: the rule lives in the single gate of `BaseAuthorizedService`, so every service inherits it without rewriting it. Inviting someone to a project brings them into the owning organization as a plain member — created already accepted, which avoids keeping two invitation tokens in sync — and that implicit membership is cleaned up when the invitation is declined or the member is removed from the project. Projects written before organizations get one at startup: one per owner, with their projects inside and the other members carried over with converted roles. It only looks at projects still without an organization, so it is safe on every boot and resumes an interrupted run on its own. Three endpoints that had no access control at all were closed along the way: inviting a collaborator, listing the members and resending a project invitation

- **Encryption At Rest For Storage And Repository Credentials**: With `SECRETS_ENCRYPTION_KEY` set (32 bytes, base64 or hex), the credentials the console keeps for a project are encrypted with AES-256-GCM before reaching Mongo: bucket keys, connection strings, service accounts, repository tokens. Whoever reads the database — a dump, a backup, a Mongo managed by someone else — sees only ciphertext. It does not protect against whoever controls the process: the backend must be able to decrypt to talk to S3 during an unattended deploy, so the key stays within reach of anyone holding the environment. The `v1` marker in the format is there to introduce a KMS-backed scheme later without rewriting the values. `storages.authConfig`, `coderepositories.accessToken/refreshToken` and the same fields inside `deployments` are covered — a deployment freezes a copy of the storages and the serve API reads the keys from there, so encrypting the `storages` collection alone would have left every past deployment's keys in the clear. Global variables stay in the clear on purpose: the platform serves them to every browser as `window.globalConfig`, and encrypting them would make them look protected without being so. With no key configured everything stays as before, with a warning at boot; a key of the wrong length stops startup; the migration that rewrites what is already stored is idempotent. See `docs/SECRETS.md`

- **Renaming A Project After Creation**: The settings page showed the name as static text — the mutation existed but was marked unused and the call was commented out, so the success toast appeared without saving anything. Name and description are now a form, modelled on `OrganizationDetailsSection`. Slug and id stay read-only because the slug is part of the path of the already-uploaded bundles. The new name is written into the store as well, otherwise the header and the switcher kept showing the old one. The invalidation key after deletion was wrong too: it was `["projects"]` while the listing lives on `["projects-mine", organizationId]`

- **Marketing Consent On The Profile Page**: The consent could only be given at registration, and the `PUT /api/users/marketing-consent` endpoint that changes it had no interface calling it. The profile page now carries the consent checkbox, showing the date it was given and clearing it on withdrawal, and appears only where `MARKETING_OPT_IN_ENABLED` is on — the same condition as the registration checkbox

### Changed

- **BREAKING — `PUT /api/projects/:projectId` Is Now Schema-Bound**: The route had no schema, so the body spread wrote whatever field the caller decided to send, `slug` among them: the slug is part of the path the already-uploaded bundles live in (`<slug>-<id>/<microfrontend>/<version>`), so changing it would have made them unreachable. The updatable fields are now taken one by one and the body is typed `ProjectUpdateInput`, which exposes neither `slug` nor `organizationId`. The response is no longer wrapped in `{ success: true, data }` — it was the only route in the backend doing that, and nobody read it that way while the client already typed it as `Project`

- **BREAKING — The API No Longer Returns Credentials**: A placeholder is returned in their place, and a field that comes back identical to the placeholder counts as "not retyped". The edit forms keep working as before; what changes is the Azure and GitLab connection test, which now sends the repository id instead of a token

- **Organization Moved From The Sidebar To The Header**: `/organization-users` sat in `mainNavItems` among the project entries, while the organization context already lives in the header with its switcher and its breadcrumb. The sidebar is now entirely about the project and the organization level has a single door: the header button, turned into a menu with settings, switching and creation. The breadcrumb name is clickable too. The route becomes `/organization`, which is what the page actually is — it carries name, description and danger zone besides the members — and the old path stays as a redirect so links and bookmarks keep working. The picker dialog is now controlled instead of hanging off a `DialogTrigger`, so "New organization" opens the form directly instead of going through the list

- **Microfrontend Form Layout**: Provider, repository and group say together where the code is but took three full rows in a wide card, and the hosting row in flex held only the two selects, leaving url and entry point below at full width, one row each. All of them now share their row and wrap only when they no longer fit. `SelectField`'s trigger does not receive `fullWidth` from the design system, so it stayed as wide as the chosen text — the form's selects now fill their column like the text fields

- **Fourteen More Components Come From The Design System**: `DangerZone` and `DangerZoneRemoveMicrofrontend` were two ~120-line files that were 95% character-identical, copy-pasted dead code included; the framed table with its tinted header row was rewritten in seven pages; eight section headings had drifted into three different weights and margins. `@mfe-orchestrator/design-system@1.5.0` adds `DangerZoneCard`, `ConfirmByTypingDialog`, `SearchInput`, `SectionHeader`, `AddTile`, `IconTile`, `Meter`, `ColorSwatch`, `StatTile`, `NumberedSteps`, `DescriptionList`, `CopyableValue` and `SelectControl`, plus a `loading` state on `Button` and `framed`/`scroll` on `Table`. Forty-three files lost a net 270 lines. Several fixes ride along: the typed confirmation in both danger zones never reset, so cancelling and reopening the dialog left the confirm button already unlocked; the numbered setup steps on the Azure and GitLab pages used raw palette colours with no dark-mode variant; one of the two canary progress bars carried no `role` or `aria-value*`; the search field in the repository import dialog was announcing the microfrontend dashboard's label; the five hand-written select labels were never associated with their control; the project id and slug in the settings page emitted a literal `false` CSS class and were never actually monospaced; and the `accent` icon tone resolved to a near-white violet, which made the api-keys icon almost invisible in light theme

- **Empty States, Code Blocks And Copy Buttons Come From The Design System**: The same three patterns were reimplemented at every call site, and had drifted apart — the empty blocks used seven different vertical paddings, five icon treatments and three text tokens for the same message, and the copy buttons disagreed on whether copying gives any feedback at all (the project id button showed none, the API key one showed a check that never reset). `@mfe-orchestrator/design-system@1.4.1` now provides `EmptyState`, `EmptyStateRow`, `CodeBlock` and `CopyButton`, and twenty-two call sites were moved onto them. The empty-state title is a real heading with a configurable level instead of bold text, the copy confirmation is announced through a live region rather than a silent icon swap, and the install and configuration snippets on the integration page can finally be copied. Some blocks change size slightly where the shared scale differs from what they had

- **Deployable Infrastructure Pinned To 4.0.0**: The Compose file, the Terraform module and the Helm chart named `2.3.0`, so a fresh installation came up two major versions behind — without the builds page, the canary strategies, the marketing opt-in, the organizations or the credential encryption. All three now name `4.0.0`, the chart version was bumped to `0.2.0`, and MongoDB and Redis are pinned to `mongo:8.0` and `redis:8-alpine` instead of floating on `latest` and `alpine`
- **Helm Values Aligned With The Configuration Schema**: `values.yaml` exposed four settings the backend never reads — `HOST`, `LOG_LEVEL`, `AZURE_ENTRAID_CLIENT_SECRET` and the `NOSQL_DB_*` aliases — and was missing three it does: `MARKETING_OPT_IN_ENABLED`, `MARKETING_OPT_IN_VERSION` and `NPM_REGISTRY_URL`, so the registration consent could not be turned on through the chart at all. The install notes no longer accept `NOSQL_DB_URL` in place of `NOSQL_DATABASE_URL`, which would have suppressed the warning while the application failed to reach the database

### Fixed

- **Startup No Longer Depends On How Long The Migration Takes**: The database plugin waits for the migrations before declaring itself ready, and Fastify gives a plugin 10 seconds: the organizations migration ran one query per project and one per member, so it overran on a remote database. Past the limit `build()` throws, the process never reaches `listen`, and nginx keeps serving the static files while the API answers 502. The migration now reads everything in a fixed number of round trips and writes with `insertMany` and `bulkWrite`, so it no longer depends on the size of the dataset. The inserts are unordered: a row that appeared in the meantime does not take the rest of the batch down. An explicit `pluginTimeout` of 60s was added as a safety net, since startup measures 12s even without a database. The database plugin now calls `done()` when no URL is configured as well — before it hung, so an installation without a database would not even answer to say so

- **The Project No Longer Follows You Across Organizations**: Invalidating `"projects-mine"` matches by prefix, so it also put the leaving organization's query back in flight. Its response arrived after the switch had happened and, that tenant having a single project, made it active and wrote it back to localStorage: the header ended up showing a project under an organization it does not belong to. The response is now discarded if the organization is no longer the selected one. Project selection follows a single order — the one in use, the remembered one, the only candidate — instead of two branches overwriting each other, and when nothing valid is left the remembered project is forgotten. Covered by `e2e/tests/organizations/multi-organization-login.spec.ts`

- **The App Button Forwards Its Ref**: The wrapper was a `React.FC` around the design system's `Button`, which is `forwardRef`, so the ref stopped there. Radix `asChild` triggers use it to anchor the panel and manage focus, so the Dialogs and DropdownMenus built on this Button started without an anchor and React flagged the component as not referenceable

- **Missing `await` In `MicrofrontendService`**

- **Switching Tab On The Microfrontend Page Did Nothing**: The panels are mounted with `forceMount` so the form keeps its values across tabs, but Radix then stops applying `hidden` — all four panels rendered stacked in a column and clicking a tab only moved the highlight. `TabsContent` in the design system now hides inactive panels by `display`, so the fields stay registered. Released as `@mfe-orchestrator/design-system@1.4.2`

### Documentation

- **User-Facing Pages Moved To The Documentation Site**: Canary releases, host integration and build status were documented both under `docs/` and on mfe-orchestrator.dev/documentation, and the repository import and dependency analysis pages have now been ported there too, so the copies in this repository only duplicated the doc site and drifted from it. The five pages and the nine screenshots only they used are gone, and README, CHANGELOG and the three agent instruction files point at the published pages instead. `docs/TELEMETRY.md` and `docs/SECRETS.md` stay: the first is the URL `telemetry.ts` logs at startup and returns from `GET /api/telemetry/status`, the second is named by the warning `config.ts` prints when `SECRETS_ENCRYPTION_KEY` is unset, and neither has an equivalent page on the doc site
- **Screenshot Capture Script**: `e2e/tests/screenshots.spec.ts` drives the builds, integration and deployment history pages with a fixed viewport and captures the raw images the documentation pages are built from, dumping the page text along the way. It is a capture script rather than a test: it signs in with a specific docs account, so it only runs where that account exists. The deployment history step walks the environments looking for one deployed more than once and, finding none, redeploys the one that already has a snapshot; its viewport is taller than the other captures on purpose, because the app scrolls inside its own container, so `fullPage` stops at the viewport
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
