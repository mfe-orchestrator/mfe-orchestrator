import { expect, test } from "@playwright/test"
import { submitLoginForm, waitForAuthenticated } from "./fixtures/appUser"

const USER = {
    email: "h8x7w.docs-msvvhtqt-xevu4j@inbox.testmail.app",
    password: "Astr0ngPassword!£%£$"
}

test.setTimeout(240_000)

test("Given the docs account When the builds and integration screens are opened Then they are captured", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "en")
        localStorage.setItem("language", "en")
        localStorage.setItem("theme", "LIGHT")
    })

    await submitLoginForm(page, USER)
    await waitForAuthenticated(page)

    // ---------- BUILDS ----------
    await page.goto("/builds")
    await expect(page.getByRole("table")).toBeVisible({ timeout: 60_000 })
    // The live status resolves after the provider answers: wait for a real badge, not the placeholder.
    await expect(page.getByRole("row").filter({ hasText: "Storefront Shell" })).toContainText(/Succeeded|Running|Failed|Queued|Canceled/, { timeout: 60_000 })
    await page.waitForTimeout(3_000)

    // Expand the host row so the last runs history is part of the shot.
    await page.getByRole("button", { name: "Show build history for Storefront Shell" }).click()
    await page.waitForTimeout(2_000)

    const table = page.getByRole("table")
    console.log("=== BUILDS TABLE TEXT ===")
    console.log(await table.innerText())

    await page.screenshot({ path: "screens/builds-page.png", fullPage: true })
    const dims = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }))
    console.log("BUILDS PAGE SIZE", JSON.stringify(dims))

    // ---------- INTEGRATION ----------
    await page.goto("/integration")
    await page.getByRole("button", { name: "Integrate my microfrontends" }).click({ timeout: 60_000 })
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText("Config to replace", { timeout: 60_000 })
    await page.waitForTimeout(2_000)
    console.log("=== MODULE FEDERATION DIALOG TEXT ===")
    console.log(await dialog.innerText())

    await page.screenshot({ path: "screens/integration-dialog.png" })

    await context.close()
})
