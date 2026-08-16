# E2E Tests with Playwright

This package contains end-to-end tests for the MFE Orchestrator application.

## Prerequisites

- Node.js >= 21.0.0
- pnpm

### Tests that read real emails

`tests/auth`, `tests/collaboration` and `tests/profile` follow links delivered by email. Mailboxes live on
[testmail.app](https://testmail.app): the app under test sends through its own SMTP and the
tests read the inbox over the public API, so the same setup works locally and against a
deployed environment such as `console-dev`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TESTMAIL_API_KEY` | yes | — | testmail.app API key. Without it those tests are skipped. |
| `TESTMAIL_NAMESPACE` | yes | — | testmail.app namespace. Addresses are built as `<namespace>.<tag>@inbox.testmail.app`. |
| `E2E_MAIL_PROVIDER` | no | `testmail` | Set to `mailinator` to use Mailinator instead (needs `MAILINATOR_API_KEY`, paid plan). |
| `MAILINATOR_API_KEY` | only with `E2E_MAIL_PROVIDER=mailinator` | — | Mailinator API key (paid plan). |
| `MAILINATOR_DOMAIN` | no | `private` | Mailinator API path segment: `private` for the account private domain, or a domain name. |
| `E2E_EMAIL_DOMAIN` | no | `mfeorchestrator.testinator.com` | Mailinator domain the addresses are built on. |
| `BASE_URL` | no | `http://localhost:5173` | Environment under test. When set, no local dev server is started. |

Each test generates its own tag, so mailboxes never collide and nothing has to be purged
between runs. Note that the free plan is metered on received emails: a full run of
`tests/auth` + `tests/collaboration` consumes around 7.

The backend must also have SMTP configured (`EMAIL_SMTP_HOST`) and able to deliver to
`inbox.testmail.app`: the suite reads `/api/configuration` and skips itself when email
delivery is off, because without an email there is no activation/invitation link to follow.
`FRONTEND_URL` on the backend only affects the origin of the emailed links — the tests keep
the path and reopen it on `BASE_URL`.

Finally, the environment must already contain at least one user: on an empty database the app
shows the first-startup screen instead of login/registration.

### Where the tests run

`BASE_URL` decides. When it is set (as in the CI workflow, which points at
`https://console-dev.mfe-orchestrator.dev`) the environment is assumed to be already up and
no local dev server is started. When it is unset, Playwright boots `pnpm dev` and tests
`http://localhost:5173`.

## Installation

The dependencies are automatically installed when you run `pnpm install` from the root directory.

## Running Tests

The root `package.json` exposes an alias for each of these, so they can be run from the
repository root without remembering the package name. The `pnpm --filter` form below is
the equivalent and works from anywhere in the monorepo.

### Run all tests
```bash
pnpm test:e2e
pnpm --filter @mfe-orchestrator/e2e test
```

### Run tests in UI mode
```bash
pnpm test:e2e:ui
pnpm --filter @mfe-orchestrator/e2e test:ui
```

### Run tests in headed mode (see browser)
```bash
pnpm test:e2e:headed
pnpm --filter @mfe-orchestrator/e2e test:headed
```

### Debug tests
```bash
pnpm test:e2e:debug
pnpm --filter @mfe-orchestrator/e2e test:debug
```

### Generate tests with Codegen
```bash
pnpm test:e2e:codegen
pnpm --filter @mfe-orchestrator/e2e test:codegen
```

### View test report
```bash
pnpm test:e2e:report
pnpm --filter @mfe-orchestrator/e2e test:report
```

## Configuration

The Playwright configuration is in `playwright.config.ts`. Key settings:

- **Base URL**: `http://localhost:5173` (can be overridden with `BASE_URL` env var)
- **Browser**: Chromium
- **Web Server**: Automatically starts the monorepo dev servers (`pnpm dev` from the repo root) when `BASE_URL` is unset

## Test layout

| Path | Covers |
| --- | --- |
| `tests/auth` | Registration, login and password reset. |
| `tests/projects` | Project creation from a brand new account. |
| `tests/collaboration` | Project invitations: inviting a brand new collaborator and inviting an already registered user. |
| `tests/environments` | Environments CRUD. |
| `tests/api-keys` | API keys create / read / revoke. |
| `tests/storages` | Storage providers CRUD. |
| `tests/profile` | Profile page: personal data and avatar upload / replace / remove. |
| `tests/project-wizard.spec.ts` | The new-project wizard. |
| `tests/fixtures` | Shared helpers: `emailClient` (inbox polling, link extraction), `appUser` (test users, registration/login flows, invitations) and `projectResources` (API seeding and verification). |

Test names are written in English in Given/When/Then form, so the report reads as a
list of expected behaviours.

Each user in `tests/collaboration` runs in its own browser context, so two accounts can be
driven in the same test without their tokens and selected project overlapping.

`tests/profile` is a `test.describe.serial`: the tests share one account and one browser
session, and each builds on the state left by the previous one. The first test registers
the account, activates it from the email link (so testmail credentials and a working SMTP
on the backend are required) and then creates a project via API — `/profile` lives inside
`MainLayout`, so without a project the first-startup wizard covers the route and the page
is never rendered.

## Writing Tests

Tests are located in the `tests` directory. Example:

```typescript
import { test, expect } from '@playwright/test';

test('my test', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/My App/);
});
```

## CI/CD

In CI environments:
- Tests retry up to 2 times on failure
- Tests run sequentially (not in parallel)
- The dev server is not reused

## Documentation

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
