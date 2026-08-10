# E2E Tests with Playwright

This package contains end-to-end tests for the MFE Orchestrator application.

## Prerequisites

- Node.js >= 21.0.0
- pnpm

### Tests that read real emails

`tests/auth` and `tests/collaboration` follow links delivered by email. Mailboxes live on
[testmail.app](https://testmail.app): the app under test sends through its own SMTP and the
tests read the inbox over the public API, so the same setup works locally and against a
deployed environment such as `console-dev`.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TESTMAIL_API_KEY` | yes | — | testmail.app API key. Without it those tests are skipped. |
| `TESTMAIL_NAMESPACE` | yes | — | testmail.app namespace. Addresses are built as `<namespace>.<tag>@inbox.testmail.app`. |
| `E2E_MAIL_PROVIDER` | no | `testmail` | Set to `mailinator` to use Mailinator instead (needs `MAILINATOR_API_KEY`, paid plan). |

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

### Run all tests
```bash
pnpm --filter @mfe-orchestrator/e2e test
```

### Run tests in UI mode
```bash
pnpm --filter @mfe-orchestrator/e2e test:ui
```

### Run tests in headed mode (see browser)
```bash
pnpm --filter @mfe-orchestrator/e2e test:headed
```

### Debug tests
```bash
pnpm --filter @mfe-orchestrator/e2e test:debug
```

### Generate tests with Codegen
```bash
pnpm --filter @mfe-orchestrator/e2e test:codegen
```

### View test report
```bash
pnpm --filter @mfe-orchestrator/e2e test:report
```

## Configuration

The Playwright configuration is in `playwright.config.ts`. Key settings:

- **Base URL**: `http://localhost:5173` (can be overridden with `BASE_URL` env var)
- **Browser**: Chromium
- **Web Server**: Automatically starts the frontend dev server before running tests

## Test layout

| Path | Covers |
| --- | --- |
| `tests/auth` | Registration, login and password reset. |
| `tests/collaboration` | Project invitations: inviting a brand new collaborator and inviting an already registered user. |
| `tests/project-wizard.spec.ts` | The new-project wizard. |
| `tests/fixtures` | Shared helpers: `mailinatorClient` (inbox polling, link extraction) and `appUser` (test users, registration/login flows, invitations). |

Each user in `tests/collaboration` runs in its own browser context, so two accounts can be
driven in the same test without their tokens and selected project overlapping.

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
