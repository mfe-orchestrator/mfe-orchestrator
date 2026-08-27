import { APIRequestContext, Browser, expect, Page, test } from "@playwright/test"
import { submitLoginForm, waitForAuthenticated } from "./fixtures/appUser"
import { toAppPath, waitForEmailLink } from "./fixtures/emailClient"

/**
 * Capture script for the account documentation pages, modelled on `screenshots.spec.ts`:
 * it is not a test, it drives the console with a fixed viewport and writes the raw images the
 * documentation is built from, dumping the text of every shot along the way so the prose can
 * quote the real labels.
 *
 * The five public routes are only reachable with a token that arrived by email, so every shot
 * here follows a real link out of a real inbox rather than a token typed by hand. That needs
 * testmail credentials and an environment with SMTP configured; the last test is the only one
 * that signs in.
 *
 * Everything it seeds is undone at the end: the throwaway account is left registered (there is
 * no endpoint to delete an account), the two invitations are revoked, and revoking a project
 * invitation that was never accepted deletes the invitee along with it.
 */

/** The documentation account, and the project and organization the shots are taken of. */
const USER = {
    email: "h8x7w.docs-msvvhtqt-xevu4j@inbox.testmail.app",
    password: "Astr0ngPassword!£%£$"
}
const PROJECT_NAME = "Acme Storefront"
const ORGANIZATION_NAME = "Dana Ferraro workspace"

const ISSUER = "microfrontend.orchestrator.hub"
const PASSWORD = "Astr0ngPassword!£%£$"

/** Auth screens are captured at the size the register and login shots already use. */
const AUTH_VIEWPORT = { width: 1440, height: 1000 }

test.setTimeout(300_000)

const run = Date.now().toString(36)
const inboxAddress = (inbox: string) => `${process.env.TESTMAIL_NAMESPACE}.${inbox}@inbox.testmail.app`

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, issuer: ISSUER })

/**
 * A request context of our own, instead of the `request` fixture.
 *
 * The console answers on a self-signed certificate: the browser is told to ignore it, the fixture
 * is not, and every call made through it dies on the handshake.
 */
const openApi = (playwright: { request: { newContext: (options: object) => Promise<APIRequestContext> } }) => playwright.request.newContext({ baseURL: process.env.BASE_URL, ignoreHTTPSErrors: true })

/**
 * Runs an API call again when the network, rather than the application, turned it down.
 *
 * The environment cold-starts, so the first call of a run regularly comes back as a gateway error,
 * and the local socket pool occasionally refuses a connection outright (`EADDRNOTAVAIL`).
 */
const retrying = async <T>(what: string, call: () => Promise<T>, attempts = 5): Promise<T> => {
    let failure: unknown
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const result = await call()
            const status = (result as { status?: () => number })?.status?.()
            if (typeof status !== "number" || status < 500 || attempt === attempts) return result
            console.log(`RETRY ${what} (${attempt}/${attempts}): HTTP ${status}`)
        } catch (error) {
            failure = error
            console.log(`RETRY ${what} (${attempt}/${attempts}): ${(error as Error).message}`)
            if (attempt === attempts) throw error
        }
        await new Promise(resolve => setTimeout(resolve, 2_000 * attempt))
    }
    throw failure ?? new Error(`${what} never succeeded`)
}

const loginViaApi = async (request: APIRequestContext): Promise<string> => {
    const response = await retrying("POST /api/users/login", () => request.post("/api/users/login", { data: USER }))
    expect(response.ok(), `Login failed (HTTP ${response.status()})`).toBeTruthy()
    return (await response.json()).accessToken as string
}

/** A browser with no session: the five public routes are all read anonymously. */
const openAnonymously = async (browser: Browser, viewport = AUTH_VIEWPORT) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "en")
        localStorage.setItem("language", "en")
        localStorage.setItem("theme", "LIGHT")
    })
    return { context, page }
}

const openConsole = async (browser: Browser, height = 900) => {
    const context = await browser.newContext({ viewport: { width: 1440, height }, deviceScaleFactor: 1, ignoreHTTPSErrors: true })
    const page = await context.newPage()
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "en")
        localStorage.setItem("language", "en")
        localStorage.setItem("theme", "LIGHT")
    })
    await submitLoginForm(page, USER)
    await waitForAuthenticated(page)
    return { context, page }
}

/** The card the auth layout centres on the page, logo included: the shot is of a whole screen. */
const shootAuthScreen = async (page: Page, name: string) => {
    await page.waitForTimeout(1_000)
    console.log(`=== ${name.toUpperCase()} TEXT ===`)
    console.log(await page.locator("body").innerText())
    await page.screenshot({ path: `screens/${name}.png` })
}

test("Given a brand new account When the activation and the password reset links are followed Then both screens are captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const inbox = `docs-flows-${run}`
    const email = inboxAddress(inbox)

    // A throwaway account of its own rather than the documentation one: requesting a reset for
    // that account would invalidate the password every other capture script signs in with.
    const registration = await retrying(`register ${email}`, () => api.post("/api/users/registration", { data: { email, password: PASSWORD } }))
    expect(registration.ok(), `Registration failed (HTTP ${registration.status()}): ${await registration.text()}`).toBeTruthy()

    const { context, page } = await openAnonymously(browser)
    try {
        // ---------- ACCOUNT ACTIVATION ----------
        const activationLink = await waitForEmailLink(api, inbox, { subject: "Activate Your Account", linkContains: "/account-activation/" })
        console.log(`ACTIVATION PATH ${toAppPath(activationLink)}`)

        // The screen calls the API as it mounts and leaves for the login as soon as it answers,
        // so the state a person actually reads is the one while the call is in flight. Holding
        // the answer back captures that state instead of racing a redirect; the call is then let
        // through untouched, and the account really is activated by this shot.
        let release: (() => void) | undefined
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await page.route("**/api/users/account-activation", async route => {
            await held
            await route.continue()
        })

        const activated = page.waitForResponse(response => response.url().includes("/users/account-activation") && response.request().method() === "POST")
        await page.goto(toAppPath(activationLink))
        await shootAuthScreen(page, "account-activation")
        release?.()
        const activationResponse = await activated
        expect(activationResponse.ok(), `Activation failed (HTTP ${activationResponse.status()})`).toBeTruthy()
        await page.unroute("**/api/users/account-activation")

        // ---------- RECOVER PASSWORD ----------
        // The form that asks for the address, reached from the login link.
        await page.goto("/reset-password-request")
        await expect(page.getByTestId("reset-password")).toBeVisible({ timeout: 60_000 })
        await page.getByLabel("Email").fill(email)
        await shootAuthScreen(page, "reset-password-request")

        // ---------- RESET PASSWORD ----------
        const reset = await retrying(`forgot-password ${email}`, () => api.post("/api/users/forgot-password", { data: { email } }))
        expect(reset.ok(), `Password reset request failed (HTTP ${reset.status()}): ${await reset.text()}`).toBeTruthy()

        const resetLink = await waitForEmailLink(api, inbox, { subject: "Reset Your Password", linkContains: "/reset-password/" })
        console.log(`RESET PATH ${toAppPath(resetLink)}`)
        await page.goto(toAppPath(resetLink))
        await expect(page.getByTestId("new-password")).toBeVisible({ timeout: 60_000 })
        // Filled in, not submitted: the shot is of the form, and the account is left alone.
        await page.getByTestId("new-password").fill(PASSWORD)
        await page.getByTestId("confirm-new-password").fill(PASSWORD)
        await shootAuthScreen(page, "reset-password")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})

test("Given a project invitation When its emailed link is opened Then the acceptance screen is captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const accessToken = await loginViaApi(api)
    const inbox = `docs-project-invite-${run}`
    const email = inboxAddress(inbox)

    const projects = await retrying("GET /api/users/me/projects", () => api.get("/api/users/me/projects", { headers: authHeaders(accessToken) }))
    const project = ((await projects.json()) as Array<{ projectId: string; name: string }>).find(candidate => candidate.name === PROJECT_NAME)
    expect(project, `The documentation account has no "${PROJECT_NAME}"`).toBeTruthy()
    const projectId = project?.projectId as string

    const invited = await retrying(`invite ${email} to ${PROJECT_NAME}`, () => api.post(`/api/projects/${projectId}/users`, { headers: authHeaders(accessToken), data: { email, role: "VIEWER" } }))
    expect(invited.ok(), `Inviting ${email} failed (HTTP ${invited.status()}): ${await invited.text()}`).toBeTruthy()

    const { context, page } = await openAnonymously(browser)
    try {
        const link = await waitForEmailLink(api, inbox, { subject: "invited to join", linkContains: "/project-invitation/" })
        console.log(`PROJECT INVITATION PATH ${toAppPath(link)}`)
        await page.goto(toAppPath(link))
        // The invitee has no password yet, so the screen asks for one: waiting on that field is
        // waiting for the invitation itself to have been read back from the API.
        await expect(page.getByTestId("invitation-password")).toBeVisible({ timeout: 60_000 })
        await shootAuthScreen(page, "project-invitation")

        // ---------- INVITATION NOT FOUND ----------
        // A token that matches nothing, which is what an already accepted or revoked link is.
        await page.goto("/project-invitation/an-invitation-that-does-not-exist")
        await expect(page.getByRole("button", { name: "Go to login" })).toBeVisible({ timeout: 60_000 })
        await shootAuthScreen(page, "invitation-not-found")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        // Revoking the invitation also deletes the invitee: the account existed only to hold it.
        try {
            const members = await retrying(`GET /api/projects/${projectId}/users`, () => api.get(`/api/projects/${projectId}/users`, { headers: authHeaders(accessToken) }))
            const rows = (await members.json()) as Array<{ userId?: { _id?: string; email?: string } | string; email?: string; user?: { _id?: string; email?: string } }>
            console.log(`MEMBERS ${JSON.stringify(rows)}`)
            const row = rows.find(candidate => JSON.stringify(candidate).includes(email))
            const userId = (row?.user?._id ?? (typeof row?.userId === "object" ? row?.userId?._id : row?.userId)) as string | undefined
            if (userId) {
                const revoked = await retrying(`DELETE ${email}`, () => api.delete(`/api/projects/${projectId}/users/${userId}`, { headers: authHeaders(accessToken) }))
                console.log(`CLEANUP project invitation for ${email}: HTTP ${revoked.status()}`)
            } else {
                console.log(`CLEANUP project invitation for ${email}: no member row found, revoke it by hand`)
            }
        } catch (error) {
            console.log(`CLEANUP project invitation failed: ${(error as Error).message}`)
        }
        await api.dispose()
    }
})

test("Given an organization invitation When its emailed link is opened Then the acceptance screen is captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const accessToken = await loginViaApi(api)
    const inbox = `docs-org-invite-${run}`
    const email = inboxAddress(inbox)

    const organizations = await retrying("GET /api/organizations/mine", () => api.get("/api/organizations/mine", { headers: authHeaders(accessToken) }))
    const organization = ((await organizations.json()) as Array<{ _id: string; name: string }>).find(candidate => candidate.name === ORGANIZATION_NAME)
    expect(organization, `The documentation account is not in "${ORGANIZATION_NAME}"`).toBeTruthy()
    const organizationId = organization?._id as string

    const invited = await retrying(`invite ${email} to ${ORGANIZATION_NAME}`, () =>
        api.post(`/api/organizations/${organizationId}/users`, { headers: authHeaders(accessToken), data: { email, role: "MEMBER" } })
    )
    expect(invited.ok(), `Inviting ${email} failed (HTTP ${invited.status()}): ${await invited.text()}`).toBeTruthy()

    const { context, page } = await openAnonymously(browser)
    try {
        const link = await waitForEmailLink(api, inbox, { subject: "invited to join", linkContains: "/organization-invitation/" })
        console.log(`ORGANIZATION INVITATION PATH ${toAppPath(link)}`)
        await page.goto(toAppPath(link))
        await expect(page.getByTestId("invitation-password")).toBeVisible({ timeout: 60_000 })
        await shootAuthScreen(page, "organization-invitation")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        try {
            const members = await retrying(`GET /api/organizations/${organizationId}/users`, () => api.get(`/api/organizations/${organizationId}/users`, { headers: authHeaders(accessToken) }))
            const rows = (await members.json()) as Array<Record<string, unknown>>
            console.log(`ORGANIZATION MEMBERS ${JSON.stringify(rows)}`)
            const row = rows.find(candidate => JSON.stringify(candidate).includes(email))
            const userIdField = row?.userId as { _id?: string } | string | undefined
            const userId = ((row?.user as { _id?: string })?._id ?? (typeof userIdField === "object" ? userIdField?._id : userIdField)) as string | undefined
            if (userId) {
                const revoked = await retrying(`DELETE ${email}`, () => api.delete(`/api/organizations/${organizationId}/users/${userId}`, { headers: authHeaders(accessToken) }))
                console.log(`CLEANUP organization invitation for ${email}: HTTP ${revoked.status()}`)
            } else {
                console.log(`CLEANUP organization invitation for ${email}: no member row found, revoke it by hand`)
            }
        } catch (error) {
            console.log(`CLEANUP organization invitation failed: ${(error as Error).message}`)
        }
        await api.dispose()
    }
})

test("Given the documentation account When the profile page is opened Then its sections are captured", async ({ browser }) => {
    // The three cards sit one under the other and the app scrolls inside its own container, so
    // the viewport has to be tall enough to hold them rather than relying on `fullPage`.
    const { context, page } = await openConsole(browser, 1200)
    try {
        await page.goto("/profile")
        // The page is a lazy chunk: cold, the default 5s are not enough.
        await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(2_000)

        console.log("=== PROFILE PAGE TEXT ===")
        console.log(await page.locator("main").innerText())

        await page.screenshot({ path: "screens/profile.png" })

        // ---------- AVATAR CARD ----------
        const avatarCard = page.locator('div:has(> div [data-testid="profile-avatar"])').last()
        console.log("=== AVATAR CARD TEXT ===")
        console.log(await avatarCard.innerText())
        await avatarCard.screenshot({ path: "screens/profile-avatar.png" })

        // ---------- MARKETING CONSENT CARD ----------
        // The card renders only where the installation collects a consent, and this environment
        // does not (`marketingOptInEnabled` is false). The answer to `/api/configuration` is
        // rewritten so the card mounts: the consent it displays is the real one on this account,
        // only the switch that decides whether the section exists is overridden.
        await page.route("**/api/configuration", async route => {
            const response = await route.fetch()
            const body = await response.json()
            await route.fulfill({ response, json: { ...body, marketingOptInEnabled: true } })
        })
        await page.goto("/profile")
        await expect(page.getByTestId("profile-marketing-consent")).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(1_000)

        const marketingCard = page.locator('div:has(> div [data-testid="profile-marketing-consent"])').last()
        console.log("=== MARKETING CONSENT CARD TEXT ===")
        console.log(await marketingCard.innerText())
        await marketingCard.screenshot({ path: "screens/profile-marketing-consent.png" })
        await page.unroute("**/api/configuration")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
    }
})
