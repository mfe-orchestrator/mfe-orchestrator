import { expect, test } from "@playwright/test"
import { emailDeliveryUnavailable, isAuthenticated, newTestUser, waitForAuthenticated } from "../fixtures/appUser"
import { toAppPath, waitForEmailLink } from "../fixtures/emailClient"

/**
 * Registrazione, primo accesso e recupero password, seguendo i link ricevuti
 * via email.
 *
 * Nota sul recupero password: sia la richiesta sia l'impostazione della nuova
 * password non hanno una schermata di conferma, mostrano un toast e riportano
 * al login. Le asserzioni seguono quel comportamento invece di aspettarsi una
 * pagina di successo.
 */
test.describe
    .serial("Registration", () => {
        const user = newTestUser("signup")
        const password = user.password
        const newPassword = "NewStr0ngPassword!£%£$"

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test("given a brand new account, when it is registered, then it can be activated from the email link", async ({ page }) => {
            await page.goto("/")
            await page.getByTestId("register-link").click()
            await page.getByTestId("email").fill(user.email)
            await page.getByTestId("password").fill(password)
            await page.getByTestId("confirm-password").fill(password)
            await page.getByTestId("create-account").click()
            await expect(page.getByTestId("registration-success")).toBeVisible()

            const link = await waitForEmailLink(page.request, user.inbox, {
                subject: "Activate Your Account",
                linkContains: "/account-activation/"
            })

            const activation = page.waitForResponse(response => response.url().includes("/users/account-activation") && response.request().method() === "POST")
            await page.goto(toAppPath(link))
            expect((await activation).ok()).toBeTruthy()
        })

        test("given an activated account, when logging in, then a session is opened", async ({ page }) => {
            await page.goto("/")
            await page.getByTestId("email").fill(user.email)
            await page.getByTestId("password").fill(password)
            await page.getByTestId("login").click()

            await waitForAuthenticated(page)
        })

        test("given an activated account, when a password reset is requested, then the reset email is delivered", async ({ page }) => {
            await page.goto("/")
            await page.getByTestId("forgot-password-link").click()
            await page.getByTestId("email").fill(user.email)
            await page.getByTestId("reset-password").click()

            // Nessuna schermata di conferma: si torna al login.
            await expect(page.getByTestId("login")).toBeVisible()

            const resetLink = await waitForEmailLink(page.request, user.inbox, {
                subject: "Reset Your Password",
                linkContains: "/reset-password/"
            })
            expect(resetLink).toContain("/reset-password/")
        })

        test("given the reset link, when a new password is set, then the old one stops working and the new one opens a session", async ({ page }) => {
            const resetLink = await waitForEmailLink(page.request, user.inbox, {
                subject: "Reset Your Password",
                linkContains: "/reset-password/"
            })
            await page.goto(toAppPath(resetLink))

            await page.getByTestId("new-password").fill(newPassword)
            await page.getByTestId("confirm-new-password").fill(newPassword)
            await page.getByTestId("submit-new-password").click()

            // Anche qui si torna al login, senza schermata intermedia.
            await expect(page.getByTestId("login")).toBeVisible()

            // La vecchia password non vale piu'.
            await page.getByTestId("email").fill(user.email)
            await page.getByTestId("password").fill(password)
            await page.getByTestId("login").click()
            await expect(page.locator(".Toastify__toast--error")).toBeVisible()
            expect(await isAuthenticated(page)).toBe(false)

            // Quella nuova apre la sessione.
            await page.getByTestId("password").fill(newPassword)
            await page.getByTestId("login").click()
            await waitForAuthenticated(page)
        })
    })
