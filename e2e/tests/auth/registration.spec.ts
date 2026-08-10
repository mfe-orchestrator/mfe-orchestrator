import { test } from "@playwright/test"
import { emailDeliveryUnavailable, newTestUser } from "../fixtures/appUser"
import { toAppPath, waitForEmailLink } from "../fixtures/emailClient"

test.describe
    .serial("Registration", () => {
        const user = newTestUser("signup")
        const password = user.password

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
            await page.getByTestId("registration-success").isVisible()

            const link = await waitForEmailLink(page.request, user.inbox, {
                subject: "Activate Your Account",
                linkContains: "/account-activation/"
            })
            await page.goto(toAppPath(link))
        })

        test("given an activated account, when logging in, then a session is opened", async ({ page }) => {
            await page.goto("/")
            await page.getByTestId("email").fill(user.email)
            await page.getByTestId("password").fill(password)
            await page.getByTestId("login").click()
        })

        test("given an activated account, when the password is reset from the email link, then the new password works", async ({ page }) => {
            await page.goto("/")
            await page.getByTestId("forgot-password-link").click()
            await page.getByTestId("email").fill(user.email)
            await page.getByTestId("reset-password").click()
            await page.getByTestId("reset-password-success").isVisible()

            const resetLink = await waitForEmailLink(page.request, user.inbox, {
                subject: "Reset Your Password",
                linkContains: "/reset-password/"
            })
            await page.goto(toAppPath(resetLink))

            const newPassword = "NewStr0ngPassword!£%£$"
            await page.getByTestId("new-password").fill(newPassword)
            await page.getByTestId("confirm-new-password").fill(newPassword)
            await page.getByTestId("submit-new-password").click()
            await page.getByTestId("password-reset-complete").isVisible()

            // Verify login with new password
            await page.goto("/")
            await page.getByTestId("email").fill(user.email)
            await page.getByTestId("password").fill(newPassword)
            await page.getByTestId("login").click()
        })
    })
