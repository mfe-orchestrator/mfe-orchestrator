import { APIRequestContext, Browser, expect, Page, test } from "@playwright/test"
import { toAppPath, waitForEmailLink } from "./fixtures/emailClient"

/**
 * Capture script for the account documentation pages, modelled on `screenshots.spec.ts`:
 * it is not a test, it drives the console with a fixed viewport and writes the raw images the
 * documentation is built from, dumping the text of every shot along the way so the prose can
 * quote the real labels.
 *
 * Unlike the other capture scripts this one seeds everything it needs — the account, the
 * organization, the project and the two invitations — instead of signing in as the documentation
 * account. The five public routes are only reachable with a token that arrived by email, and a
 * shared environment is the wrong place to reset a password or leave invitations lying around.
 *
 * Point it at a throwaway instance with a mail catcher:
 *
 *     BASE_URL=http://localhost:8081 MAILPIT_URL=http://localhost:8026 \
 *       pnpm exec playwright test tests/screenshots-account.spec.ts --workers=1
 *
 * The marketing consent card only exists where the installation collects a consent, so that
 * instance also needs `MARKETING_OPT_IN_ENABLED=true`. With `MAILPIT_URL` unset the mail is read
 * through the usual testmail provider instead, and the addresses below have to be inboxes it owns.
 */

/** The account every shot is taken as: the same person the rest of the documentation shows. */
const OWNER = {
    email: "dana.ferraro@example.com",
    password: "Astr0ngPassword!",
    name: "Dana",
    surname: "Ferraro"
}
const ORGANIZATION_NAME = "Dana Ferraro workspace"
const PROJECT_NAME = "Acme Storefront"

/** Invited and left unanswered: their inboxes only ever hold the invitation. */
const PROJECT_INVITEE = "sam.okafor@example.com"
const ORGANIZATION_INVITEE = "alex.moreau@example.com"

const ISSUER = "microfrontend.orchestrator.hub"

/** Auth screens are captured at the size the register and login shots already use. */
const AUTH_VIEWPORT = { width: 1440, height: 1000 }

test.setTimeout(300_000)

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, issuer: ISSUER })

/**
 * A request context of our own, instead of the `request` fixture.
 *
 * A deployed console answers on a self-signed certificate: the browser is told to ignore it, the
 * fixture is not, and every call made through it dies on the handshake.
 */
const openApi = (playwright: { request: { newContext: (options: object) => Promise<APIRequestContext> } }) => playwright.request.newContext({ baseURL: process.env.BASE_URL, ignoreHTTPSErrors: true })

/**
 * Runs an API call again when the network, rather than the application, turned it down.
 *
 * A cold instance regularly answers the first call of a run with a gateway error, and the local
 * socket pool occasionally refuses a connection outright (`EADDRNOTAVAIL`).
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

// #region mail

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const decodeHtmlEntities = (value: string) => value.replaceAll("&#x2F;", "/").replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&")

/**
 * The link out of a delivered email.
 *
 * Mailpit when `MAILPIT_URL` is set — a catcher on the instance under capture, which needs no
 * account and no quota — and the testmail provider the rest of the suite uses otherwise. The two
 * are interchangeable here because the script only ever asks one question of a mailbox: which
 * link did this message carry.
 */
const waitForLink = async (request: APIRequestContext, recipient: string, options: { subject: string; linkContains: string; timeout?: number }): Promise<string> => {
    const mailpit = process.env.MAILPIT_URL
    if (!mailpit) {
        // On testmail the mailbox is the tag of the address, not the address itself.
        return waitForEmailLink(request, recipient.split("@")[0].split(".").slice(-1)[0], options)
    }

    const deadline = Date.now() + (options.timeout ?? 90_000)
    let seen: string[] = []
    while (Date.now() < deadline) {
        const list = await request.get(`${mailpit}/api/v1/messages?limit=50`)
        if (list.ok()) {
            const messages = ((await list.json())?.messages ?? []) as Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>
            seen = messages.map(message => `${message.Subject} -> ${message.To.map(to => to.Address).join(",")}`)
            for (const message of messages) {
                if (!message.To.some(to => to.Address.toLowerCase() === recipient.toLowerCase())) continue
                if (!message.Subject.toLowerCase().includes(options.subject.toLowerCase())) continue
                const detail = await request.get(`${mailpit}/api/v1/message/${message.ID}`)
                if (!detail.ok()) continue
                const body = (await detail.json()) as { HTML?: string; Text?: string }
                const links = [
                    ...[...(body.HTML ?? "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => decodeHtmlEntities(match[1])),
                    ...[...(body.Text ?? "").matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)].map(match => decodeHtmlEntities(match[0]))
                ]
                const link = links.find(candidate => candidate.includes(options.linkContains))
                if (link) return link
            }
        }
        await sleep(2_000)
    }
    throw new Error(`No ${options.linkContains} link reached ${recipient} in time. Mailpit holds: ${JSON.stringify(seen)}`)
}

// #endregion

// #region seeding

/** Registers the owner, or signs it in again when a previous run already created it. */
const ensureOwner = async (request: APIRequestContext): Promise<{ accessToken: string }> => {
    // Signing in first: a rerun finds the account already there, and registering an existing
    // address answers 500, which the retry loop would spend four rounds on before giving up.
    let login = await request.post("/api/users/login", { data: { email: OWNER.email, password: OWNER.password } })
    if (!login.ok()) {
        const registration = await retrying(`register ${OWNER.email}`, () =>
            request.post("/api/users/registration", { data: { email: OWNER.email, password: OWNER.password, marketingConsent: false } })
        )
        expect(registration.ok(), `Registering ${OWNER.email} failed (HTTP ${registration.status()}): ${await registration.text()}`).toBeTruthy()
        console.log(`SEED ${OWNER.email}: registered`)
        login = await retrying("POST /api/users/login", () => request.post("/api/users/login", { data: { email: OWNER.email, password: OWNER.password } }))
    }
    expect(login.ok(), `Signing in as ${OWNER.email} failed (HTTP ${login.status()}): ${await login.text()}`).toBeTruthy()
    return { accessToken: (await login.json()).accessToken as string }
}

const ensureOrganization = async (request: APIRequestContext, accessToken: string): Promise<string> => {
    const mine = await retrying("GET /api/organizations/mine", () => request.get("/api/organizations/mine", { headers: authHeaders(accessToken) }))
    const existing = ((await mine.json()) as Array<{ _id: string; name: string }>).find(candidate => candidate.name === ORGANIZATION_NAME)
    if (existing) return existing._id

    const created = await retrying("POST /api/organizations", () => request.post("/api/organizations", { headers: authHeaders(accessToken), data: { name: ORGANIZATION_NAME } }))
    expect(created.ok(), `Creating "${ORGANIZATION_NAME}" failed (HTTP ${created.status()}): ${await created.text()}`).toBeTruthy()
    return ((await created.json()) as { _id: string })._id
}

const ensureProject = async (request: APIRequestContext, accessToken: string, organizationId: string): Promise<string> => {
    const mine = await retrying("GET /api/users/me/projects", () => request.get("/api/users/me/projects", { headers: authHeaders(accessToken) }))
    const existing = ((await mine.json()) as Array<{ projectId: string; name: string }>).find(candidate => candidate.name === PROJECT_NAME)
    if (existing) return existing.projectId

    const created = await retrying("POST /api/projects", () => request.post("/api/projects", { headers: authHeaders(accessToken), data: { name: PROJECT_NAME, organizationId } }))
    expect(created.ok(), `Creating "${PROJECT_NAME}" failed (HTTP ${created.status()}): ${await created.text()}`).toBeTruthy()
    return ((await created.json()) as { _id: string })._id
}

// #endregion

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
    const { context, page } = await openAnonymously(browser, { width: 1440, height })
    await page.goto("/")
    await page.getByTestId("email").fill(OWNER.email)
    await page.getByTestId("password").fill(OWNER.password)
    await page.getByTestId("login").click()
    await page.waitForFunction(() => Boolean(localStorage.getItem("token")), undefined, { timeout: 60_000 })
    return { context, page }
}

/** The card the auth layout centres on the page, logo included: the shot is of a whole screen. */
const shootAuthScreen = async (page: Page, name: string) => {
    await page.waitForTimeout(1_000)
    console.log(`=== ${name.toUpperCase()} TEXT ===`)
    console.log(await page.locator("body").innerText())
    await page.screenshot({ path: `screens/${name}.png` })
}

test("Given a brand new account When the activation link is followed Then the activation screen is captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const { context, page } = await openAnonymously(browser)
    try {
        const registration = await retrying(`register ${OWNER.email}`, () => api.post("/api/users/registration", { data: { email: OWNER.email, password: OWNER.password, marketingConsent: false } }))
        console.log(`SEED ${OWNER.email}: ${registration.ok() ? "registered" : `already present (HTTP ${registration.status()})`}`)

        const link = await waitForLink(api, OWNER.email, { subject: "Activate Your Account", linkContains: "/account-activation/" })
        console.log(`ACTIVATION PATH ${toAppPath(link)}`)

        // The screen calls the API as it mounts and leaves for the login as soon as it answers, so
        // the state a person actually reads is the one while the call is in flight. Holding the
        // answer back captures that state instead of racing a redirect; the call is then let
        // through untouched, so the account really is activated by this shot.
        let release: (() => void) | undefined
        const held = new Promise<void>(resolve => {
            release = resolve
        })
        await page.route("**/api/users/account-activation", async route => {
            await held
            await route.continue()
        })

        const activated = page.waitForResponse(response => response.url().includes("/users/account-activation") && response.request().method() === "POST")
        await page.goto(toAppPath(link))
        await shootAuthScreen(page, "account-activation")
        release?.()
        const response = await activated
        console.log(`ACTIVATION RESULT HTTP ${response.status()}`)
        await page.unroute("**/api/users/account-activation")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})

test("Given a forgotten password When the reset is requested and its link followed Then both screens are captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const { context, page } = await openAnonymously(browser)
    try {
        // ---------- RECOVER PASSWORD ----------
        // The form that asks for the address, reached from the link under the login form.
        await page.goto("/reset-password-request")
        await expect(page.getByTestId("reset-password")).toBeVisible({ timeout: 60_000 })
        await page.getByLabel("Email").fill(OWNER.email)
        await shootAuthScreen(page, "reset-password-request")

        // ---------- RESET PASSWORD ----------
        const requested = await retrying(`forgot-password ${OWNER.email}`, () => api.post("/api/users/forgot-password", { data: { email: OWNER.email } }))
        expect(requested.ok(), `Requesting the reset failed (HTTP ${requested.status()}): ${await requested.text()}`).toBeTruthy()

        const link = await waitForLink(api, OWNER.email, { subject: "Reset Your Password", linkContains: "/reset-password/" })
        console.log(`RESET PATH ${toAppPath(link)}`)
        await page.goto(toAppPath(link))
        await expect(page.getByTestId("new-password")).toBeVisible({ timeout: 60_000 })
        // Filled in, not submitted: the shot is of the form, and the password stays what it was.
        await page.getByTestId("new-password").fill(OWNER.password)
        await page.getByTestId("confirm-new-password").fill(OWNER.password)
        await shootAuthScreen(page, "reset-password")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})

test("Given a project invitation When its emailed link is opened Then the acceptance screen is captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const { accessToken } = await ensureOwner(api)
    const organizationId = await ensureOrganization(api, accessToken)
    const projectId = await ensureProject(api, accessToken, organizationId)

    const invited = await retrying(`invite ${PROJECT_INVITEE}`, () =>
        api.post(`/api/projects/${projectId}/users`, { headers: authHeaders(accessToken), data: { email: PROJECT_INVITEE, role: "VIEWER" } })
    )
    console.log(`SEED project invitation for ${PROJECT_INVITEE}: HTTP ${invited.status()}`)

    const { context, page } = await openAnonymously(browser)
    try {
        const link = await waitForLink(api, PROJECT_INVITEE, { subject: "invited to join", linkContains: "/project-invitation/" })
        console.log(`PROJECT INVITATION PATH ${toAppPath(link)}`)
        await page.goto(toAppPath(link))
        // The invitee has no password yet, so the screen asks for one: waiting on that field is
        // waiting for the invitation itself to have been read back from the API.
        await expect(page.getByTestId("invitation-password")).toBeVisible({ timeout: 60_000 })
        await shootAuthScreen(page, "project-invitation")

        // ---------- INVITATION NOT FOUND ----------
        // A token that matches nothing, which is what an accepted or revoked link is.
        await page.goto("/project-invitation/an-invitation-that-does-not-exist")
        await expect(page.getByRole("button", { name: "Go to login" })).toBeVisible({ timeout: 60_000 })
        await shootAuthScreen(page, "invitation-not-found")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})

test("Given an organization invitation When its emailed link is opened Then the acceptance screen is captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const { accessToken } = await ensureOwner(api)
    const organizationId = await ensureOrganization(api, accessToken)

    const invited = await retrying(`invite ${ORGANIZATION_INVITEE}`, () =>
        api.post(`/api/organizations/${organizationId}/users`, { headers: authHeaders(accessToken), data: { email: ORGANIZATION_INVITEE, role: "MEMBER" } })
    )
    console.log(`SEED organization invitation for ${ORGANIZATION_INVITEE}: HTTP ${invited.status()}`)

    const { context, page } = await openAnonymously(browser)
    try {
        const link = await waitForLink(api, ORGANIZATION_INVITEE, { subject: "invited to join", linkContains: "/organization-invitation/" })
        console.log(`ORGANIZATION INVITATION PATH ${toAppPath(link)}`)
        await page.goto(toAppPath(link))
        await expect(page.getByTestId("invitation-password")).toBeVisible({ timeout: 60_000 })
        await shootAuthScreen(page, "organization-invitation")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})

test("Given the account When the profile page is opened Then the page and its cards are captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const { accessToken } = await ensureOwner(api)
    const organizationId = await ensureOrganization(api, accessToken)
    await ensureProject(api, accessToken, organizationId)

    // A name to show, and a consent already granted so the card carries the date it was given on:
    // that line is half of what the section is about, and it only renders once the box is ticked.
    await retrying("PUT /api/users/profile", () => api.put("/api/users/profile", { headers: authHeaders(accessToken), data: { name: OWNER.name, surname: OWNER.surname } }))
    // The language stored on the account is applied once the session is established and overrides
    // whatever localStorage was seeded with, so it is the account that has to be told to speak English.
    await retrying("POST /api/users/language", () => api.post("/api/users/language", { headers: authHeaders(accessToken), data: { language: "en" } }))
    const consent = await retrying("PUT /api/users/marketing-consent", () => api.put("/api/users/marketing-consent", { headers: authHeaders(accessToken), data: { marketingConsent: true } }))
    expect(consent.ok(), `Granting the consent failed (HTTP ${consent.status()}): ${await consent.text()}. Is MARKETING_OPT_IN_ENABLED set?`).toBeTruthy()

    const { context, page } = await openConsole(browser, 1300)
    try {
        await page.goto("/profile")
        await expect(page.getByTestId("profile-marketing-consent")).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(2_000)

        console.log("=== PROFILE PAGE TEXT ===")
        console.log(await page.locator("main").innerText())

        // The three cards sit one under the other and the app scrolls inside its own container, so
        // the viewport has to be tall enough to hold them rather than relying on `fullPage`.
        await page.screenshot({ path: "screens/profile.png" })

        // ---------- PROFILE PICTURE ----------
        const avatarCard = page.locator('div:has(> div [data-testid="profile-avatar"])').last()
        console.log("=== PROFILE PICTURE CARD TEXT ===")
        console.log(await avatarCard.innerText())
        await avatarCard.screenshot({ path: "screens/profile-avatar.png" })

        // ---------- MARKETING CONSENT ----------
        const marketingCard = page.locator('div:has(> div [data-testid="profile-marketing-consent"])').last()
        console.log("=== MARKETING CONSENT CARD TEXT ===")
        console.log(await marketingCard.innerText())
        await marketingCard.screenshot({ path: "screens/profile-marketing-consent.png" })
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})
