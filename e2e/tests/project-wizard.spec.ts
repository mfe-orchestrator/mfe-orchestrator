import { expect, Page, test } from "@playwright/test"
import { loginViaApi } from "./fixtures/auth"

/**
 * End-to-end coverage for the backend orchestrated New Project Wizard.
 *
 * The wizard has one route per step (`/project-wizard/:projectId/:step`) and the
 * step shown is the one the backend says the project is on: the tests therefore
 * assert the url as well as the rendered step.
 *
 * Prerequisites: a verified user must exist (defaults to the local seed user
 * demo@mfe.local / Password123!, overridable via E2E_EMAIL / E2E_PASSWORD).
 *
 * The Ambienti and Storage steps reuse the real feature components
 * (NoEnvironmentPlaceholder / StorageForm), so those steps are driven by their
 * own controls ("Ambienti Base" preset + "Salva", storage "Salta").
 */
test.describe("Project Wizard", () => {
    test.beforeEach(async ({ page, request }) => {
        await loginViaApi(page, request)
        // /new always starts a fresh wizard, /project-wizard alone would resume
        // one left running by another test.
        await page.goto("/project-wizard/new")
        await expect(page.getByTestId("wizard-step-title")).toBeVisible()
    })

    const stepUrl = (step: string) => new RegExp(`/project-wizard/[a-f0-9]{24}/${step}$`)

    const projectIdFromUrl = (page: Page) => new URL(page.url()).pathname.split("/")[2]

    const fillNameAndContinue = async (page: Page, name: string) => {
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
        await page.getByTestId("wizard-project-name").fill(name)
        await page.getByTestId("wizard-next").click()
        // The backend creates the project and answers with the step that follows
        await expect(page).toHaveURL(stepUrl("environments"))
    }

    const chooseEnvironmentPresetAndSave = async (page: Page, presetName: string) => {
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/configura gli ambienti/i)
        await page.getByText(presetName, { exact: true }).click()
        await page.getByRole("button", { name: "Salva" }).click()
    }

    const abortSetup = async (page: Page) => {
        await page.getByTestId("wizard-abort").click()
        await page.getByTestId("wizard-abort-confirm").click()
    }

    test("walks through all the steps, one route per step, and reaches the success screen", async ({ page }) => {
        await expect(page).toHaveURL(/\/project-wizard\/new$/)
        await fillNameAndContinue(page, `E2E Wizard ${Date.now()}`)

        // Step 2 — Ambienti (reused NoEnvironmentPlaceholder)
        await chooseEnvironmentPresetAndSave(page, "Ambienti Base")

        // Step 3 — Storage (reused StorageForm, skip via "Salta")
        await expect(page).toHaveURL(stepUrl("storages"))
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/ospitiamo/i)
        await page.getByRole("button", { name: "Salta" }).click()

        // Step 4 — Repository (skip)
        await expect(page).toHaveURL(stepUrl("repositories"))
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/codice sorgente/i)
        await page.getByTestId("wizard-skip").click()

        // Step 5 — Collaboratori (skip & complete)
        await expect(page).toHaveURL(stepUrl("team-mates"))
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/invita i collaboratori/i)
        await page.getByTestId("wizard-skip").click()

        // Completed: the project is unlocked only now
        await expect(page).toHaveURL(stepUrl("completed"))
        await expect(page.getByTestId("wizard-completed")).toBeVisible()
        await expect(page.getByText("Progetto pronto!")).toBeVisible()

        await page.getByTestId("wizard-go-to-dashboard").click()
        await expect(page).toHaveURL(/\/microfrontends/)
    })

    test("keeps the user on step 1 when the project name is missing", async ({ page }) => {
        await page.getByTestId("wizard-next").click()
        await expect(page).toHaveURL(/\/project-wizard\/new$/)
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
    })

    test("supports going back to a previous step", async ({ page }) => {
        await fillNameAndContinue(page, `E2E Back ${Date.now()}`)

        await page.getByTestId("wizard-back").click()
        await expect(page).toHaveURL(stepUrl("main-data"))
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)

        await abortSetup(page)
    })

    test("bounces the user back when a step ahead is opened by url", async ({ page }) => {
        await fillNameAndContinue(page, `E2E Jump ${Date.now()}`)
        const projectId = projectIdFromUrl(page)

        // The team mates step has not been reached yet: the backend state wins
        await page.goto(`/project-wizard/${projectId}/team-mates`)
        await expect(page).toHaveURL(stepUrl("environments"))
        await expect(page.getByTestId("wizard-step-title")).toHaveText(/configura gli ambienti/i)

        await abortSetup(page)
    })

    test("locks the project until the wizard is completed", async ({ page }) => {
        await fillNameAndContinue(page, `E2E Lock ${Date.now()}`)
        const projectId = projectIdFromUrl(page)

        // The console cannot be opened on a project that is still being configured
        await page.goto("/microfrontends")
        await expect(page).toHaveURL(new RegExp(`/project-wizard/${projectId}/environments$`))

        await abortSetup(page)
    })

    test("lets the user add/remove collaborator rows before completing", async ({ page }) => {
        await fillNameAndContinue(page, `E2E Collab ${Date.now()}`)
        await chooseEnvironmentPresetAndSave(page, "Ambienti Standard")
        await page.getByRole("button", { name: "Salta" }).click() // storage
        await page.getByTestId("wizard-skip").click() // repository

        await expect(page.getByTestId("wizard-step-title")).toHaveText(/invita i collaboratori/i)
        await page.getByTestId("wizard-collaborator-email-0").fill("collega@example.com")
        await page.getByRole("button", { name: /aggiungi collaboratore/i }).click()
        await expect(page.getByTestId("wizard-collaborator-email-1")).toBeVisible()

        // Complete without actually sending invites (skip & complete)
        await page.getByTestId("wizard-skip").click()
        await expect(page.getByTestId("wizard-completed")).toBeVisible()
    })

    test("abandons the setup and removes the half configured project", async ({ page }) => {
        await fillNameAndContinue(page, `E2E Abort ${Date.now()}`)
        const projectId = projectIdFromUrl(page)

        await abortSetup(page)

        await expect(page).not.toHaveURL(new RegExp(projectId))
    })
})
