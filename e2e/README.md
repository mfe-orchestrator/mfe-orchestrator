# E2E Tests with Playwright

This package contains end-to-end tests for the MFE Orchestrator application.

## Prerequisites

- Node.js >= 21.0.0
- pnpm

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
