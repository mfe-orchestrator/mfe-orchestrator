import { expect, test } from "@playwright/test"
import { activateAccountFromEmail, emailDeliveryUnavailable, isAuthenticated, newTestUser, openApp, registerViaUi, submitLoginForm, waitForAuthenticated } from "../fixtures/appUser"

/**
 * Login con le credenziali locali (email e password).
 *
 * L'utente viene registrato e attivato dal primo test, cosi' i casi successivi
 * lavorano su credenziali reali invece che su un utente seed che deve esistere
 * in ambiente.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE)
 * e SMTP configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Login", () => {
        const user = newTestUser("login")

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test("given a brand new account, when it is registered, then it can be activated from the email link", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)

            await registerViaUi(page, user)
            await activateAccountFromEmail(page, request, user)

            await context.close()
        })

        test("given an activated account, when logging in with the right credentials, then a session is opened", async ({ browser }) => {
            const { context, page } = await openApp(browser)

            await submitLoginForm(page, user)
            await waitForAuthenticated(page)

            // Il form di login non e' piu' a video: si e' entrati nella app.
            await expect(page.getByTestId("login")).toHaveCount(0)

            await context.close()
        })

        test("given an activated account, when logging in with a wrong password, then an error is shown and no session is opened", async ({ browser }) => {
            const { context, page } = await openApp(browser)

            await submitLoginForm(page, { email: user.email, password: "PasswordSbagliata!123" })

            await expect(page.locator(".Toastify__toast--error")).toBeVisible()
            await expect(page.getByTestId("login")).toBeVisible()
            expect(await isAuthenticated(page)).toBe(false)

            await context.close()
        })

        test("given an unknown email, when logging in, then an error is shown and no session is opened", async ({ browser }) => {
            const { context, page } = await openApp(browser)

            await submitLoginForm(page, { email: `sconosciuto-${Date.now()}@inbox.testmail.app`, password: user.password })

            await expect(page.locator(".Toastify__toast--error")).toBeVisible()
            expect(await isAuthenticated(page)).toBe(false)

            await context.close()
        })

        test("given an open session, when the page is reloaded, then the session survives", async ({ browser }) => {
            const { context, page } = await openApp(browser)

            await submitLoginForm(page, user)
            await waitForAuthenticated(page)

            await page.reload()

            expect(await isAuthenticated(page)).toBe(true)
            await expect(page.getByTestId("login")).toHaveCount(0)

            await context.close()
        })
    })
