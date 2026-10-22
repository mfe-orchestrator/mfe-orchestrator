import { APIRequestContext, Browser, expect, Page, test } from "@playwright/test"

/**
 * Capture script for the first-startup documentation, modelled on `screenshots.spec.ts`:
 * it is not a test, it drives the console with a fixed viewport and writes the raw images the
 * documentation is built from, dumping the text of every shot along the way so the prose can quote
 * the real labels.
 *
 * The screen it captures exists only while the database holds **no users at all**, so it cannot be
 * taken on a shared environment: the first person to open one made it disappear forever. Point it at
 * a throwaway instance with an empty database:
 *
 *     BASE_URL=http://localhost:8081 \
 *       pnpm exec playwright test tests/screenshots-first-startup.spec.ts --workers=1
 *
 * The SSO shot needs at least one provider configured on that instance (`GOOGLE_CLIENT_ID` is
 * enough — it is never called, the shot is of the button). Run it before the plain shot's
 * submission, or drop the users collection in between: every test here asserts it is still looking
 * at a virgin installation, and fails rather than capturing a login form by mistake.
 */

const AUTH_VIEWPORT = { width: 1440, height: 1000 }

test.setTimeout(180_000)

const openApi = (playwright: { request: { newContext: (options: object) => Promise<APIRequestContext> } }) => playwright.request.newContext({ baseURL: process.env.BASE_URL, ignoreHTTPSErrors: true })

/** Refuses to run against an installation that already has a user: the screen would not be there. */
const expectVirginInstallation = async (request: APIRequestContext) => {
    const response = await request.get("/api/startup/users/exists")
    expect(response.ok(), `Reading the startup state failed (HTTP ${response.status()})`).toBeTruthy()
    const { exists } = (await response.json()) as { exists: boolean }
    expect(exists, "This installation already has a user, so the first-startup screen is gone. Drop the users collection and retry.").toBe(false)
}

const openAnonymously = async (browser: Browser) => {
    const context = await browser.newContext({ viewport: AUTH_VIEWPORT, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "en")
        localStorage.setItem("language", "en")
        localStorage.setItem("theme", "LIGHT")
    })
    return { context, page }
}

const shootAuthScreen = async (page: Page, name: string) => {
    await page.waitForTimeout(1_000)
    console.log(`=== ${name.toUpperCase()} TEXT ===`)
    console.log(await page.locator("body").innerText())
    await page.screenshot({ path: `screens/${name}.png` })
}

test("Given an installation with no users When the console is opened Then the initial setup screen is captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    await expectVirginInstallation(api)

    const { context, page } = await openAnonymously(browser)
    try {
        await page.goto("/")
        await expect(page.getByText("Initial Setup")).toBeVisible({ timeout: 60_000 })
        // Filled in, not submitted: submitting is what makes the screen cease to exist, and the
        // values are the ones the prose quotes when it explains what each field ends up naming.
        // Addressed by type and placeholder rather than by label: on this form only the email field
        // carries an id, so the other two have no label to be found by.
        await page.getByLabel("Email").fill("dana.ferraro@example.com")
        await page.locator('input[type="password"]').fill("Astr0ngPassword!")
        await page.getByPlaceholder("Enter your project name").fill("Acme Storefront")
        await shootAuthScreen(page, "first-startup")

        // The screen is the outermost wrapper of the whole application, so it answers on every
        // route rather than only on the root. Worth asserting, because it is what somebody
        // following an invitation link into an empty installation actually gets.
        await page.goto("/register")
        await expect(page.getByText("Initial Setup")).toBeVisible({ timeout: 30_000 })
        console.log("ROUTE /register on an empty installation shows the setup screen")
        await page.goto("/project-invitation/whatever")
        await expect(page.getByText("Initial Setup")).toBeVisible({ timeout: 30_000 })
        console.log("ROUTE /project-invitation/:token on an empty installation shows the setup screen")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})

test("Given an installation with a provider configured When the setup screen is opened Then the SSO variant is captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    await expectVirginInstallation(api)

    const configuration = await api.get("/api/configuration")
    const providers = ((await configuration.json()) as { providers: Record<string, unknown> }).providers
    expect(Object.keys(providers).length, "No provider is configured on this instance, so there is no SSO row to capture. Set GOOGLE_CLIENT_ID and restart it.").toBeGreaterThan(0)
    console.log(`PROVIDERS ${Object.keys(providers).join(", ")}`)

    const { context, page } = await openAnonymously(browser)
    try {
        await page.goto("/")
        await expect(page.getByText("Initial Setup")).toBeVisible({ timeout: 60_000 })
        await expect(page.getByText("Or continue with")).toBeVisible({ timeout: 30_000 })
        await shootAuthScreen(page, "first-startup-sso")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})
