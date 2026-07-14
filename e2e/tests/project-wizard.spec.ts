import { expect, test } from "@playwright/test"
import { loginViaApi } from "./fixtures/auth"

/**
 * End-to-end coverage for the New Project Wizard (/project-wizard).
 *
 * Prerequisites: a verified user must exist (defaults to the local seed user
 * demo@mfe.local / Password123!, overridable via E2E_EMAIL / E2E_PASSWORD).
 */
test.describe("Project Wizard", () => {
    test.beforeEach(async ({ page, request }) => {
        await loginViaApi(page, request)
        await page.goto("/project-wizard")
        await expect(page.getByTestId("wizard-step-title")).toBeVisible()
    })

    test("walks through all 5 steps and reaches the success screen", async ({ page }) => {
        // Step 1 — Nome
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
        await page.getByTestId("wizard-project-name").fill(`E2E Wizard ${Date.now()}`)
        await page.getByTestId("wizard-next").click()

        // Step 2 — Ambienti (default "Standard" preset, or pick "Base")
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/configura gli ambienti/i)
        await page.getByTestId("wizard-preset-base").click()
        await page.getByTestId("wizard-next").click()

        // Step 3 — Storage (skip)
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/ospitiamo/i)
        await page.getByTestId("wizard-skip").click()

        // Step 4 — Repository (skip)
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/codice sorgente/i)
        await page.getByTestId("wizard-skip").click()

        // Step 5 — Collaboratori (skip & complete)
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/invita i collaboratori/i)
        await page.getByTestId("wizard-skip").click()

        // Completed
        await expect(page.getByTestId("wizard-completed")).toBeVisible()
        await expect(page.getByText("Progetto pronto!")).toBeVisible()
    })

    test("keeps the user on step 1 when the project name is missing", async ({ page }) => {
        await page.getByTestId("wizard-next").click()
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
    })

    test("supports going back to a previous step", async ({ page }) => {
        await page.getByTestId("wizard-project-name").fill(`E2E Back ${Date.now()}`)
        await page.getByTestId("wizard-next").click()
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/configura gli ambienti/i)

        await page.getByTestId("wizard-back").click()
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
    })

    test("lets the user add/remove collaborator rows before completing", async ({ page }) => {
        await page.getByTestId("wizard-project-name").fill(`E2E Collab ${Date.now()}`)
        await page.getByTestId("wizard-next").click()
        await page.getByTestId("wizard-next").click() // ambienti (default Standard)
        await page.getByTestId("wizard-skip").click() // storage
        await page.getByTestId("wizard-skip").click() // repository

        await expect(page.getByTestId("wizard-step-title")).toHaveText(/invita i collaboratori/i)
        await page.getByTestId("wizard-collaborator-email-0").fill("collega@example.com")
        await page.getByRole("button", { name: /aggiungi collaboratore/i }).click()
        await expect(page.getByTestId("wizard-collaborator-email-1")).toBeVisible()

        // Complete without actually sending invites (skip & complete)
        await page.getByTestId("wizard-skip").click()
        await expect(page.getByTestId("wizard-completed")).toBeVisible()
    })

    test("closes the wizard and returns to the dashboard", async ({ page }) => {
        await page.getByRole("button", { name: "Chiudi wizard" }).click()
        await expect(page).toHaveURL(/\/microfrontends/)
    })
})
