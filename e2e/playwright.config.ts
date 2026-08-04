import { defineConfig, devices } from "@playwright/test"

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./tests",

    /* Run tests in files in parallel */
    fullyParallel: true,

    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,

    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,

    /* Opt out of parallel tests on CI. */
    workers: process.env.CI ? 1 : undefined,

    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: process.env.CI
        ? [["html", { outputFolder: "playwright-report" }], ["json", { outputFile: "test-results/results.json" }], ["github"], ["list"]]
        : [["html", { outputFolder: "playwright-report" }], ["list"]],

    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: process.env.BASE_URL || "http://localhost:5173",

        /* Collect trace - always on locally for UI mode, on retry in CI */
        trace: process.env.CI ? "on-first-retry" : "on",

        /* Screenshot - capture all steps locally for UI mode, only failures in CI */
        screenshot: process.env.CI ? "only-on-failure" : "on",

        /* Video - always on locally for UI mode, only on failure in CI */
        video: process.env.CI ? "retain-on-failure" : "on"
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] }
        }
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: "pnpm dev",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        cwd: "..",
        env: {
            TURBO_UI: "true",
            FORCE_COLOR: "1",
            CI: "true"
        }
    }
})
