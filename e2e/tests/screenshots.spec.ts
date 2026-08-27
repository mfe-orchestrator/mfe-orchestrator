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

test("Given the docs account When a deployment of the history is expanded Then it is captured", async ({ browser }) => {
    // The app scrolls inside its own container, so `fullPage` stops at the viewport:
    // the height has to be tall enough to hold the active deployment and the expanded
    // history entry together, which is the comparison the shot exists for.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "en")
        localStorage.setItem("language", "en")
        localStorage.setItem("theme", "LIGHT")
    })

    await submitLoginForm(page, USER)
    await waitForAuthenticated(page)

    await page.goto("/deployments")
    await expect(page.getByText("Active deployment")).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(2_000)

    // The rollback page is about the history: expanding its newest entry is what shows
    // the versions a Redeploy would restore, next to the ones serving now. Only an
    // environment deployed more than once has one, so look for it across all of them.
    const entries = page.getByRole("button", { name: /Deployment #/ })
    const selector = page.getByRole("combobox").first()
    const environments = await selector.evaluate(node => Array.from(node.parentElement?.querySelectorAll("option") ?? []).map(option => option.textContent))
    console.log("ENVIRONMENT OPTIONS", JSON.stringify(environments))

    await selector.click()
    const options = page.getByRole("option")
    const names: string[] = []
    for (let index = 0; index < (await options.count()); index++) {
        names.push((await options.nth(index).innerText()).trim())
    }
    console.log("ENVIRONMENTS", JSON.stringify(names))
    await page.keyboard.press("Escape")

    let count = await entries.count()
    for (const name of names) {
        if (count > 1) break
        await selector.click()
        await page.getByRole("option", { name, exact: true }).click()
        await page.waitForTimeout(3_000)
        count = await entries.count()
        console.log(`${name}: ${count} deployment(s)`)
    }

    // No environment has been deployed twice, so there is no history yet. Deploying the
    // one that already has a snapshot pushes it into the history, which is the state
    // this shot is about.
    if (count <= 1) {
        await selector.click()
        await page.getByRole("option", { name: "DEV", exact: true }).click()
        await page.waitForTimeout(2_000)
        await page.getByRole("button", { name: "Deploy", exact: true }).click()
        await expect(entries).toHaveCount(2, { timeout: 60_000 })
        await page.waitForTimeout(2_000)
        count = await entries.count()
        console.log("DEPLOYED, now", count)
    }

    expect(count, "no deployment in the history to capture").toBeGreaterThan(1)

    await entries.nth(1).click()
    await page.waitForTimeout(2_000)

    console.log("=== DEPLOYMENTS PAGE TEXT ===")
    console.log(await page.locator("main").innerText())

    await page.screenshot({ path: "screens/deployments-history.png", fullPage: true })
    const dims = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }))
    console.log("DEPLOYMENTS PAGE SIZE", JSON.stringify(dims))

    await context.close()
})
