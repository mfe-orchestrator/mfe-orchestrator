import { APIRequestContext, expect, Page, test } from "@playwright/test"
import { submitLoginForm, waitForAuthenticated } from "./fixtures/appUser"

/**
 * Capture script for the Organizations documentation pages, modelled on `screenshots.spec.ts`:
 * it is not a test, it drives the console with a fixed viewport and writes the raw images the
 * documentation is built from, dumping the text of every shot along the way so the prose can
 * quote the real labels.
 *
 * It signs in with the documentation account, so it only runs where that account exists.
 *
 * Two states the console does not have on its own are seeded here, both additively:
 *   - one invitation left pending, so the pending invitations table has a row to show. The
 *     invitation is only created, never accepted: this environment does not deliver the
 *     organization invitation email (the mailboxes stay empty), and the acceptance endpoint that
 *     needs no email requires the invitee to already have a session of their own. The members
 *     table therefore shows the owner alone, which is what the documentation states;
 *   - a second organization, needed for the switcher to have anything to switch to. It is
 *     deleted again at the end: with two organizations the app asks which one to use before
 *     opening, and the documentation account is expected to land straight on the project.
 *
 * Seeding is idempotent: re-inviting somebody still pending refreshes their invitation, and the
 * second organization is reused if a previous run was interrupted before deleting it.
 */

const USER = {
    email: "h8x7w.docs-msvvhtqt-xevu4j@inbox.testmail.app",
    password: "Astr0ngPassword!£%£$"
}

/** The organization the documentation account works in, and the one the shots are taken of. */
const ORGANIZATION_NAME = "Dana Ferraro workspace"

/** Opened for the switcher shots and deleted afterwards. */
const SANDBOX_ORGANIZATION_NAME = "Docs Sandbox"

const ISSUER = "microfrontend.orchestrator.hub"

/** Invited and left unanswered, so the pending invitations table exists. */
const PENDING_INVITE_INBOX = "docs-org-pending"

const inboxAddress = (inbox: string) => `${process.env.TESTMAIL_NAMESPACE}.${inbox}@inbox.testmail.app`

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}`, issuer: ISSUER })

test.setTimeout(300_000)

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

/**
 * A request context of our own, instead of the `request` fixture.
 *
 * The console answers on a self-signed certificate: the browser is told to ignore it, the fixture
 * is not, and every call made through it dies on the handshake.
 */
const openApi = (playwright: { request: { newContext: (options: object) => Promise<APIRequestContext> } }) => playwright.request.newContext({ baseURL: process.env.BASE_URL, ignoreHTTPSErrors: true })

/** Signs in through the API: the seeding below needs a token, not a browser. */
const loginViaApi = async (request: APIRequestContext): Promise<string> => {
    const response = await retrying("POST /api/users/login", () => request.post("/api/users/login", { data: USER }))
    expect(response.ok(), `Login failed (HTTP ${response.status()})`).toBeTruthy()
    return (await response.json()).accessToken as string
}

const findOrganization = async (request: APIRequestContext, accessToken: string, name: string) => {
    const response = await retrying("GET /api/organizations/mine", () => request.get("/api/organizations/mine", { headers: authHeaders(accessToken) }))
    expect(response.ok(), `Reading the organizations failed (HTTP ${response.status()})`).toBeTruthy()
    return ((await response.json()) as Array<{ _id: string; name: string }>).find(organization => organization.name === name)
}

/** Leaves one invitation unanswered, so the pending invitations table has a row. */
const seedPendingInvitation = async (request: APIRequestContext, accessToken: string, organizationId: string) => {
    const email = inboxAddress(PENDING_INVITE_INBOX)
    const response = await retrying(`invite ${email}`, () =>
        request.post(`/api/organizations/${organizationId}/users`, {
            headers: authHeaders(accessToken),
            data: { email, role: "MEMBER" }
        })
    )
    // Re-inviting somebody who is still pending simply refreshes their invitation, which is what
    // this needs; only an accepted membership makes the call fail, and that cannot be undone here.
    console.log(`SEED ${email}: pending invitation ${response.ok() ? "sent" : await response.text()}`)
}

const openConsole = async (browser: import("@playwright/test").Browser, height = 900) => {
    const context = await browser.newContext({ viewport: { width: 1440, height }, deviceScaleFactor: 1 })
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

/**
 * A shot covering several elements at once.
 *
 * An element screenshot crops to one box, and the organization menu only means something with
 * the header it hangs from above it, so the boxes are merged and padded by hand.
 */
const clipAround = async (page: Page, selectors: string[], padding = 8) => {
    const boxes = []
    for (const selector of selectors) {
        const box = await page.locator(selector).first().boundingBox()
        expect(box, `${selector} is not on screen`).toBeTruthy()
        boxes.push(box as NonNullable<typeof box>)
    }
    const left = Math.min(...boxes.map(box => box.x)) - padding
    const top = Math.min(...boxes.map(box => box.y)) - padding
    const right = Math.max(...boxes.map(box => box.x + box.width)) + padding
    const bottom = Math.max(...boxes.map(box => box.y + box.height)) + padding
    return { x: Math.max(0, left), y: Math.max(0, top), width: right - Math.max(0, left), height: bottom - Math.max(0, top) }
}

test("Given the documentation account When the header organization menu and the switcher are opened Then they are captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const accessToken = await loginViaApi(api)
    const organization = await findOrganization(api, accessToken, ORGANIZATION_NAME)
    expect(organization, `The documentation account is not in "${ORGANIZATION_NAME}"`).toBeTruthy()

    // Something to switch to. Reused when a previous run left it behind.
    let sandbox = await findOrganization(api, accessToken, SANDBOX_ORGANIZATION_NAME)
    if (!sandbox) {
        const created = await retrying("POST /api/organizations", () =>
            api.post("/api/organizations", {
                headers: authHeaders(accessToken),
                data: { name: SANDBOX_ORGANIZATION_NAME, description: "Scratch tenant used to capture the switcher" }
            })
        )
        expect(created.ok(), `Creating "${SANDBOX_ORGANIZATION_NAME}" failed (HTTP ${created.status()})`).toBeTruthy()
        sandbox = await created.json()
    }

    const { context, page } = await openConsole(browser)
    try {
        // A second organization exists now, so the app asks which one to use before opening
        // anything, and the header the menu hangs from is not on that screen: wait for whichever
        // of the two came up.
        const picker = page.getByTestId(`organization-option-${organization?._id}`)
        await expect(picker.or(page.getByTestId("switch-organization"))).toBeVisible({ timeout: 60_000 })
        if (await picker.count()) {
            await picker.click()
        }
        await expect(page.getByTestId("switch-project")).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(2_000)

        // ---------- HEADER MENU ----------
        await page.getByTestId("switch-organization").click()
        const menu = page.getByRole("menu")
        await expect(menu).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(500)
        console.log("=== HEADER TEXT ===")
        console.log(await page.locator("header").first().innerText())
        console.log("=== ORGANIZATION MENU TEXT ===")
        console.log(await menu.innerText())
        await page.screenshot({ path: "screens/organization-menu.png", clip: await clipAround(page, ["header", '[role="menu"]'], 10) })

        // ---------- SWITCHER DIALOG ----------
        await page.getByTestId("organization-switch-action").click()
        const dialog = page.getByRole("dialog")
        await expect(dialog).toContainText(SANDBOX_ORGANIZATION_NAME, { timeout: 30_000 })
        await page.waitForTimeout(1_000)
        console.log("=== SWITCHER DIALOG TEXT ===")
        console.log(await dialog.innerText())
        await dialog.screenshot({ path: "screens/organization-switcher.png" })

        // ---------- CREATE FORM ----------
        // The same dialog, with the list replaced by the creation form.
        await dialog.getByRole("button", { name: "Create new organization" }).click()
        await expect(dialog.getByTestId("organization-name")).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(500)
        console.log("=== CREATE ORGANIZATION DIALOG TEXT ===")
        console.log(await dialog.innerText())
        await dialog.screenshot({ path: "screens/organization-create.png" })
        await page.keyboard.press("Escape")
    } finally {
        // Reported rather than thrown: a cleanup that fails must not hide the capture error that
        // brought the run here in the first place.
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        // Back to a single organization: otherwise every fresh sign-in stops on the picker.
        if (sandbox) {
            const sandboxId = sandbox._id
            try {
                const deleted = await retrying(`DELETE ${SANDBOX_ORGANIZATION_NAME}`, () => api.delete(`/api/organizations/${sandboxId}`, { headers: authHeaders(accessToken) }))
                console.log(`CLEANUP ${SANDBOX_ORGANIZATION_NAME}: HTTP ${deleted.status()}`)
            } catch (error) {
                console.log(`CLEANUP ${SANDBOX_ORGANIZATION_NAME} failed: ${(error as Error).message}`)
            }
        }
        await api.dispose()
    }
})

test("Given the documentation account When the organization page is opened Then its sections are captured", async ({ browser, playwright }) => {
    const api = await openApi(playwright)
    const accessToken = await loginViaApi(api)
    const organization = await findOrganization(api, accessToken, ORGANIZATION_NAME)
    expect(organization, `The documentation account is not in "${ORGANIZATION_NAME}"`).toBeTruthy()

    await seedPendingInvitation(api, accessToken, organization?._id as string)

    // The page carries the details card, the members table, the pending invitations and the
    // danger zone one under the other: the app scrolls inside its own container, so the viewport
    // has to be tall enough to hold all of them rather than relying on `fullPage`.
    const { context, page } = await openConsole(browser, 2200)
    try {
        // A run interrupted before its cleanup leaves the second organization behind, and then the
        // app asks which one to use before opening anything.
        const picker = page.getByTestId(`organization-option-${organization?._id}`)
        await expect(picker.or(page.getByTestId("switch-project"))).toBeVisible({ timeout: 60_000 })
        if (await picker.count()) {
            await picker.click()
        }
        await page.goto("/organization")
        await expect(page.getByTestId(`organization-member-${USER.email}`)).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(2_000)

        console.log("=== ORGANIZATION PAGE TEXT ===")
        console.log(await page.locator("main").innerText())

        // ---------- DETAILS ----------
        // The whole card, its title included: the form on its own says nothing about what it edits.
        // Anchored on the save button rather than on the heading, which is not exposed as one.
        const details = page.locator('div.rounded-lg.border-2:has([data-testid="organization-details-save"])').first()
        await details.screenshot({ path: "screens/organization-details.png" })

        // ---------- MEMBERS ----------
        // The section, not the bare table: the count above it ("One member") is part of what the
        // shot is about. The pending invitations section is built the same way and carries a test
        // id, which is what tells the two apart.
        const members = page.locator("div.space-y-4:has(table):not([data-testid])").first()
        console.log("=== MEMBERS SECTION TEXT ===")
        console.log(await members.innerText())
        await members.screenshot({ path: "screens/organization-members.png" })

        // ---------- PENDING INVITATIONS ----------
        const pending = page.getByTestId("organization-pending-invites")
        await expect(pending).toBeVisible({ timeout: 30_000 })
        console.log("=== PENDING INVITATIONS TEXT ===")
        console.log(await pending.innerText())
        await pending.screenshot({ path: "screens/organization-pending-invitations.png" })

        // ---------- DANGER ZONE ----------
        // Blocked on purpose: the organization holds a project, and deleting it is refused until
        // the projects are gone. That refusal is the point of the shot.
        const dangerZone = page.locator("div.border-destructive").first()
        console.log("=== DANGER ZONE TEXT ===")
        console.log(await dangerZone.innerText())
        await dangerZone.screenshot({ path: "screens/organization-danger-zone.png" })

        // ---------- INVITE DIALOG ----------
        await page.getByTestId("invite-organization-user").click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByTestId("invite-organization-user-email")).toBeVisible({ timeout: 30_000 })
        await dialog.getByTestId("invite-organization-user-email").fill("designer@example.com")
        await page.waitForTimeout(500)
        console.log("=== INVITE DIALOG TEXT ===")
        console.log(await dialog.innerText())
        await dialog.screenshot({ path: "screens/organization-invite.png" })
        await page.keyboard.press("Escape")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
        await api.dispose()
    }
})
