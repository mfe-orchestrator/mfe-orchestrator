import { expect, test } from "@playwright/test"
import { submitLoginForm, waitForAuthenticated } from "./fixtures/appUser"

const USER = {
    email: "h8x7w.docs-msvvhtqt-xevu4j@inbox.testmail.app",
    password: "Astr0ngPassword!£%£$"
}

/**
 * Where the finished images go. The canary documentation page reads them straight out of the
 * documentation repository, which sits next to this one, so the crops are written there instead of
 * into `screens/`: there is nothing to post-process afterwards.
 */
const DOCS_ASSETS = "../../documentation/docs/assets"

/** Language and theme the documentation images are taken in. */
const forceEnglishLightTheme = async (page: import("@playwright/test").Page) => {
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "en")
        localStorage.setItem("language", "en")
        localStorage.setItem("theme", "LIGHT")
    })
}

test.setTimeout(240_000)

test("Given the docs account When the canary of a microfrontend is configured Then the form and the list views are captured", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await forceEnglishLightTheme(page)

    await submitLoginForm(page, USER)
    await waitForAuthenticated(page)

    // ---------- LIST VIEWS ----------
    await page.goto("/microfrontends")
    // Diagram view is the default and the switcher is a tablist, so the views are tabs, not buttons.
    const gridView = page.getByRole("tab", { name: "Grid view" })
    await expect(gridView).toBeVisible({ timeout: 120_000 })
    await page.waitForTimeout(2_500)
    await gridView.click()
    await page.waitForTimeout(2_500)

    console.log("=== GRID VIEW TEXT ===")
    console.log(await page.locator("main").innerText())
    await page.screenshot({ path: `${DOCS_ASSETS}/microfrontends-grid-view.png` })

    // The canary block of a single card, cropped: the docs quote it on its own to show the share bar.
    const catalogCard = page
        .locator("div")
        .filter({ hasText: /^Product Catalog/ })
        .filter({ has: page.getByRole("button", { name: "Configuration" }) })
        .last()
    const cardBox = await catalogCard.boundingBox()
    expect(cardBox, "the Product Catalog card was not found in grid view").not.toBeNull()
    await page.screenshot({ path: `${DOCS_ASSETS}/microfrontend-canary-card.png`, clip: cardBox! })

    const tableView = page.getByRole("tab", { name: "Table view" })
    await tableView.click()
    await page.waitForTimeout(2_000)
    console.log("=== TABLE VIEW TEXT ===")
    console.log(await page.getByRole("table").innerText())
    await page.screenshot({ path: `${DOCS_ASSETS}/microfrontends-table-view.png` })

    await context.close()
})

test("Given the docs account When the canary settings section is filled in Then it is captured", async ({ browser }) => {
    // Taller than the list views on purpose: the Release card sits above the tabs, so the shot has
    // to hold the card, the tab bar and the General panel together, and the app scrolls inside its
    // own container, which makes `fullPage` stop at the viewport.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await forceEnglishLightTheme(page)

    await submitLoginForm(page, USER)
    await waitForAuthenticated(page)

    const openConfiguration = async (name: string) => {
        await page.goto("/microfrontends")
        const tableView = page.getByRole("tab", { name: "Table view" })
        await expect(tableView).toBeVisible({ timeout: 120_000 })
        await page.waitForTimeout(2_500)
        await tableView.click()
        await page.waitForTimeout(1_500)
        await page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: "Configuration" }).click()
        await expect(page.getByLabel(/^Version/)).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(3_500)
    }

    // The selects are Radix comboboxes whose id is the form field, with a hidden native select
    // beside them for submission: driving the combobox is the only path that moves the form state.
    const pickOption = async (field: string, option: string) => {
        await page.locator(`button[role="combobox"][id="${field}"]`).click()
        await page.waitForTimeout(700)
        await page.getByRole("option", { name: option, exact: true }).click()
        await page.waitForTimeout(700)
    }

    // ---------- THE FORM, WITH A CANARY ALREADY CONFIGURED ----------
    // Product Catalog carries a Session canary, so the section shows the percentage slider as well:
    // On User hides it, having no traffic share to set.
    await openConfiguration("Product Catalog")
    console.log("=== FORM TABS ===")
    console.log(await page.getByRole("tablist").last().innerText())
    await page.screenshot({ path: `${DOCS_ASSETS}/microfrontend-form.png` })

    // The Canary Type select, open on its three options.
    const canaryType = page.locator('button[role="combobox"][id="canary.type"]')
    const typeLabelBox = await page.locator('label[for="canary.type"]').boundingBox()
    const canaryTypeBox = await canaryType.boundingBox()
    await canaryType.click()
    await page.waitForTimeout(1_000)
    const listbox = page.getByRole("listbox")
    console.log("=== CANARY TYPE OPTIONS ===")
    console.log(await listbox.innerText())
    const listboxBox = await listbox.boundingBox()
    const typeClipX = Math.max(0, canaryTypeBox!.x - 10)
    const typeClipY = typeLabelBox!.y - 4
    await page.screenshot({
        path: `${DOCS_ASSETS}/microfrontend-canary-type.png`,
        clip: {
            x: typeClipX,
            y: typeClipY,
            width: Math.min(1440 - typeClipX, Math.max(canaryTypeBox!.width, listboxBox!.width) + 12),
            height: listboxBox!.y + listboxBox!.height - typeClipY + 12
        }
    })
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)

    // ---------- THE CANARY SETTINGS SECTION, FILLED IN FROM SCRATCH ----------
    // Account Area starts without a canary, so it is the one to configure without disturbing the
    // two that already have one.
    await openConfiguration("Account Area")

    const canarySwitch = page.locator('[role="switch"][id="canary.enabled"]')
    if ((await canarySwitch.getAttribute("aria-checked")) !== "true") {
        await canarySwitch.click()
        await page.waitForTimeout(1_500)
    }

    // The type goes first: On User has no traffic share, so the percentage slider is not rendered
    // while it is selected — and a previous run of this spec leaves Account Area on User.
    await pickOption("canary.type", "Session")
    await pickOption("canary.deploymentType", "Based on Version")

    // The presets under the slider are Radix toggle items rather than buttons, so the value is set
    // on the slider itself: Home takes it to 0 and every ArrowRight adds one point.
    const slider = page.getByRole("slider", { name: "Canary Percentage" })
    await expect(slider).toBeVisible({ timeout: 30_000 })
    await slider.focus()
    await page.keyboard.press("Home")
    for (let step = 0; step < 25; step++) {
        await page.keyboard.press("ArrowRight")
    }
    await page.waitForTimeout(800)
    expect(await slider.getAttribute("aria-valuenow")).toBe("25")
    await page.locator('input[name="canary.version"]').fill("1.0.0-rc.1")
    await page.waitForTimeout(1_200)

    const canaryBox = await page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll("h3")).find(element => element.textContent?.trim() === "Canary Settings")
        const block = heading?.closest("div.border-t")
        if (!block) return null
        const rect = block.getBoundingClientRect()
        const x = Math.max(0, rect.x - 20)
        return { x, y: Math.max(0, rect.y - 16), width: Math.min(1440 - x, rect.width + 40), height: rect.height + 28 }
    })
    expect(canaryBox, "the Canary Settings block was not found").not.toBeNull()
    console.log("=== CANARY SETTINGS TEXT ===")
    console.log(await page.locator('h3:text("Canary Settings")').locator('xpath=ancestor::div[contains(@class,"border-t")]').innerText())
    await page.screenshot({ path: `${DOCS_ASSETS}/microfrontend-canary.png`, clip: canaryBox! })

    // Saved as a User canary, so the deployment card of the next test reads "Enrolled users" next
    // to the two percentage ones.
    await pickOption("canary.type", "User")
    await page.waitForTimeout(500)
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page).toHaveURL(/\/microfrontends$/, { timeout: 60_000 })

    await context.close()
})

test("Given the docs account When a deployment carrying canaries is opened Then its cards and its canary users are captured", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await forceEnglishLightTheme(page)

    await submitLoginForm(page, USER)
    await waitForAuthenticated(page)

    await page.goto("/deployments")
    await expect(page.getByText("Active deployment")).toBeVisible({ timeout: 120_000 })
    await page.waitForTimeout(3_000)

    // Deploying is what freezes the canary just configured into a snapshot, so the cards below
    // describe the strategies rather than the previous deployment's.
    const environment = page.getByRole("combobox").first()
    await environment.click()
    await page.waitForTimeout(700)
    await page.getByRole("option", { name: "DEV", exact: true }).click()
    await page.waitForTimeout(3_000)
    await page.getByRole("button", { name: "Deploy", exact: true }).click()
    await page.waitForTimeout(12_000)

    console.log("=== DEPLOYMENTS PAGE TEXT ===")
    console.log(await page.locator("main").innerText())

    // The active deployment comes already expanded: clicking its accordion trigger would close it.
    // The clip is the smallest element still holding all four cards, which is the grid they sit in.
    const cardsBox = await page.evaluate(() => {
        const names = ["Storefront Shell", "Product Catalog", "Checkout Flow", "Account Area"]
        const leaf = Array.from(document.querySelectorAll("main *")).find(element => element.children.length === 0 && element.textContent?.trim() === names[0])
        let node = leaf ?? null
        while (node && !names.every(name => node?.textContent?.includes(name))) {
            node = node.parentElement
        }
        if (!node) return null
        const rect = node.getBoundingClientRect()
        const x = Math.max(0, rect.x - 14)
        return { x, y: rect.y - 4, width: Math.min(1440 - x, rect.width + 28), height: rect.height + 18 }
    })
    expect(cardsBox, "the microfrontend cards of the active deployment were not found").not.toBeNull()
    await page.screenshot({ path: `${DOCS_ASSETS}/deployment-canary-cards.png`, clip: cardsBox! })

    // ---------- CANARY USERS ----------
    // The action is rendered as a link, not a button: the design system Button takes an href.
    await page.getByRole("link", { name: "View canary users" }).first().click()
    await expect(page.getByText("Canary Users").first()).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(3_000)

    // The rows are expected to be here already: creating a deployment copies the enrolment of the
    // one it replaces, so this list is also the check that the carry-over happened.
    console.log("=== CANARY USERS TEXT ===")
    console.log(await page.locator("main").innerText())

    await page.getByRole("checkbox", { name: "Select all users" }).click()
    await page.waitForTimeout(1_200)
    console.log("=== CANARY USERS, ALL SELECTED ===")
    console.log(await page.locator("main").innerText())

    // Back to the viewport the other canary users shot was taken at, so the table fills the frame.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(1_000)
    await page.screenshot({ path: `${DOCS_ASSETS}/canary-users.png` })

    await context.close()
})
