import { expect, Page, test } from "@playwright/test"
import { submitLoginForm, waitForAuthenticated } from "./fixtures/appUser"

/**
 * Capture script for the pages that document a single microfrontend, modelled on
 * `screenshots.spec.ts`: it is not a test, it drives the console with a fixed viewport and writes
 * the raw images the documentation is built from, dumping the text of every shot along the way so
 * the prose can quote the real labels.
 *
 * It signs in with the documentation account, so it only runs where that account exists.
 *
 * Nothing is created: the creation form is opened and filled but never submitted, because
 * submitting it would create a repository in the connected provider. The edit form is only read —
 * selects are opened and dismissed with Escape, never saved.
 *
 * The version selector of `versions-and-builds` is deliberately not captured here. That field is a
 * list only once the platform has seen an upload, and this project has none, so it renders as a
 * plain text box: capturing it would replace an illustration of the list with one of the empty
 * state. Seeding it needs an API key and a bundle upload per version.
 */

const USER = {
    email: "h8x7w.docs-msvvhtqt-xevu4j@inbox.testmail.app",
    password: "Astr0ngPassword!£%£$"
}

/** Opened for the hosting type shot. Any microfrontend of the project would do. */
const MICROFRONTEND_ID = "6a81c2a9e601d1372d30b6de"

/** Picked in the creation flow: the remote templates are the common case. */
const TEMPLATE = "Vite & React - remote Template"

test.setTimeout(240_000)

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
 * An element screenshot crops to one box, and a call to action means nothing without the heading
 * it belongs to, so the boxes are merged and padded by hand.
 */
const clipAround = async (page: Page, selectors: string[], padding = 8) => {
    const boxes = []
    for (const selector of selectors) {
        const box = await page.locator(selector).first().boundingBox()
        expect(box, `${selector} is not on screen`).toBeTruthy()
        boxes.push(box as NonNullable<typeof box>)
    }
    const left = Math.max(0, Math.min(...boxes.map(box => box.x)) - padding)
    const top = Math.max(0, Math.min(...boxes.map(box => box.y)) - padding)
    const right = Math.max(...boxes.map(box => box.x + box.width)) + padding
    const bottom = Math.max(...boxes.map(box => box.y + box.height)) + padding
    return { x: left, y: top, width: right - left, height: bottom - top }
}

test("Given the documentation account When the microfrontends page and the template library are opened Then they are captured", async ({ browser }) => {
    const { context, page } = await openConsole(browser, 1000)
    try {
        await page.goto("/microfrontends")
        const addButton = page.getByRole("button", { name: /Add New Microfrontend/i })
        await expect(addButton).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(3_000)

        // ---------- THE ENTRY POINT ----------
        // The heading and the two actions together: the step this illustrates is "from the
        // Microfrontends page, click Add New Microfrontend", and the button alone does not say
        // which page it is on. The listing itself is documented by the grid and table shots.
        console.log("=== MICROFRONTENDS HEADER TEXT ===")
        console.log(await page.locator("main").innerText())
        await page.screenshot({
            path: "screens/add-new-microfrontend.png",
            clip: await clipAround(page, ["h1", "button:has-text('Add New Microfrontend')"], 12)
        })

        // ---------- THE TEMPLATE LIBRARY ----------
        // A full page of its own rather than a dialog, with the three filters the documentation
        // names (framework, compiler, host type) above the cards grouped by framework.
        await addButton.click()
        await expect(page.getByText(TEMPLATE, { exact: false }).first()).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(3_000)
        console.log("=== TEMPLATE LIBRARY TEXT ===")
        console.log((await page.locator("body").innerText()).slice(0, 1_200))
        await page.screenshot({ path: "screens/choose-a-template.png" })
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
    }
})

test("Given a template When the creation form is filled Then it is captured without being submitted", async ({ browser }) => {
    // Release card, the three tabs and the buttons have to fit together: the app scrolls inside its
    // own container, so the viewport is what decides, not `fullPage`.
    const { context, page } = await openConsole(browser, 1_150)
    try {
        await page.goto("/microfrontends")
        await expect(page.getByRole("button", { name: /Add New Microfrontend/i })).toBeVisible({ timeout: 60_000 })
        await page.getByRole("button", { name: /Add New Microfrontend/i }).click()
        await page.getByText(TEMPLATE, { exact: false }).first().click({ timeout: 60_000 })

        await expect(page.getByTestId("name")).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(2_000)

        // Plausible values, so the shot shows a form in use rather than an empty one. Never saved.
        await page.getByTestId("version").fill("1.0.0")
        await page.getByTestId("name").fill("Wishlist")
        await page.getByTestId("slug").fill("wishlist")
        await page.getByTestId("description").fill("Saved items and share links.")
        await page.waitForTimeout(1_000)

        console.log("=== CREATION FORM TEXT ===")
        console.log(await page.locator("main").innerText())
        console.log("=== TABS ===")
        console.log((await page.getByRole("tab").allInnerTexts()).join(" | "))
        await page.screenshot({ path: "screens/frontend-fill-information.png" })
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
    }
})

test("Given an existing microfrontend When the hosting type list is opened Then it is captured", async ({ browser }) => {
    const { context, page } = await openConsole(browser, 1_000)
    try {
        await page.goto(`/microfrontend/${MICROFRONTEND_ID}`)
        await expect(page.getByRole("tab", { name: "Hosting" })).toBeVisible({ timeout: 60_000 })
        await page.waitForTimeout(3_000)

        await page.getByRole("tab", { name: "Hosting" }).click()
        await expect(page.getByTestId("host.type")).toBeVisible({ timeout: 30_000 })
        await page.getByTestId("host.type").click()
        await expect(page.getByRole("option").first()).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(1_000)

        const options = await page.getByRole("option").allInnerTexts()
        console.log("=== HOSTING TYPE OPTIONS ===")
        console.log(JSON.stringify(options))

        // The list and the field it belongs to, and nothing above them. This is a Radix select
        // aligned on its selected item, so the open list always covers the card heading rather than
        // dropping below the trigger: widening the crop upwards only slices that heading in half.
        // "Custom Source" is absent because the project has no storage configured, which is the
        // condition the documentation states.
        // Padding on three sides only: any margin above the list catches the glyph tops of the
        // heading it covers, so the top edge is the list's own.
        const list = await page.locator('[role="listbox"]').first().boundingBox()
        const trigger = await page.getByTestId("host.type").boundingBox()
        expect(list && trigger, "the hosting type list is not on screen").toBeTruthy()
        const left = Math.max(0, Math.min(list!.x, trigger!.x) - 6)
        await page.screenshot({
            path: "screens/microfrontend-hosting-type.png",
            clip: {
                x: left,
                y: list!.y,
                width: Math.max(list!.x + list!.width, trigger!.x + trigger!.width) + 6 - left,
                height: trigger!.y + trigger!.height + 6 - list!.y
            }
        })
        await page.keyboard.press("Escape")
    } finally {
        await context.close().catch(error => console.log(`CLEANUP browser context: ${(error as Error).message}`))
    }
})
