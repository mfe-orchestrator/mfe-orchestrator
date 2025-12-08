# GitHub Actions Workflows

This directory contains the CI/CD workflows for the MFE Orchestrator project.

## Available Workflows

### E2E Tests (`e2e-tests.yml`)

Runs end-to-end tests using Playwright.

**Triggers:**
- Manual trigger via GitHub Actions UI (`workflow_dispatch`)
- Scheduled: Every Monday at 6:00 AM UTC

**What it does:**
1. Sets up the environment (Node.js 21, pnpm)
2. Installs project dependencies
3. Installs Playwright Chromium browser
4. Runs all E2E tests
5. Uploads test reports and results as artifacts (retained for 30 days)

**How to run manually:**
1. Go to the "Actions" tab in GitHub
2. Select "E2E Tests" workflow
3. Click "Run workflow"
4. Select the branch and click "Run workflow"

**Viewing test reports:**
After a workflow run completes, you can download the following artifacts:
- `playwright-report`: HTML report with detailed test results
- `test-results`: Raw test results and failure screenshots/videos

## Adding New Workflows

When adding new workflows, follow these conventions:
- Use kebab-case for file names
- Add meaningful job names
- Use timeout-minutes to prevent hanging jobs
- Upload relevant artifacts for debugging
- Document the workflow in this README
