import { Browser, expect, Page, test } from "@playwright/test"
import { AppSession, activateAccountFromEmail, createProjectViaApi, emailDeliveryUnavailable, loginViaApi, newTestUser, openApp, openAppAs, registerViaUi } from "./fixtures/appUser"

/**
 * Wizard di creazione progetto (/project-wizard), passo per passo.
 *
 * L'utente si registra da solo invece di dipendere da un utente seed presente
 * in ambiente, e parte con un progetto gia' creato via API: senza, la app
 * mostrerebbe il wizard di primo avvio al posto di quello raggiungibile via
 * rotta. Ogni test riparte da `/project-wizard`, che monta un wizard nuovo.
 *
 * I passi Ambienti e Storage riusano i componenti veri della feature
 * (NoEnvironmentPlaceholder / StorageForm), quindi si guidano con i loro
 * controlli invece che con quelli del wizard.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE)
 * e SMTP configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Project Wizard", () => {
        const owner = newTestUser("wizard")
        const suffix = Date.now().toString(36)

        let session: AppSession | undefined

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        /** Riporta il wizard al primo passo: senza projectId nella rotta ne monta uno nuovo. */
        const openWizard = async (browser: Browser): Promise<Page> => {
            const { page } = await getSession(browser)
            await page.goto("/project-wizard")
            await expect(page.getByTestId("wizard-step-title")).toBeVisible({ timeout: 30_000 })
            return page
        }

        const fillNameAndContinue = async (page: Page, name: string) => {
            await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
            await page.getByTestId("wizard-project-name").fill(name)
            await page.getByTestId("wizard-next").click()
        }

        const chooseEnvironmentPresetAndSave = async (page: Page, presetName: string) => {
            await expect(page.getByTestId("wizard-step-title")).toHaveText(/configura gli ambienti/i)
            await page.getByTestId(`environment-preset-${presetName}`).click()
            await page.getByTestId("environments-save").click()
        }

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test.afterAll(async () => {
            await session?.context.close()
        })

        test("given a brand new account, when it is registered and activated, then it owns a project the wizard can run beside", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)
            await registerViaUi(page, owner)
            await activateAccountFromEmail(page, request, owner)
            await context.close()

            const accessToken = await loginViaApi(request, owner)
            const project = await createProjectViaApi(request, accessToken, `E2E Wizard base ${suffix}`)
            expect(project._id).toBeTruthy()
        })

        test("given the wizard, when all five steps are walked through, then the success screen is reached", async ({ browser }) => {
            const page = await openWizard(browser)

            await fillNameAndContinue(page, `E2E Wizard ${suffix}`)

            // Passo 2 — Ambienti (NoEnvironmentPlaceholder riusato)
            await chooseEnvironmentPresetAndSave(page, "Ambienti Base")

            // Passo 3 — Storage (StorageForm riusato, saltato)
            await expect(page.getByTestId("wizard-step-title")).toHaveText(/ospitiamo/i)
            await page.getByTestId("storage-cancel").click()

            // Passo 4 — Repository
            await expect(page.getByTestId("wizard-step-title")).toHaveText(/codice sorgente/i)
            await page.getByTestId("wizard-skip").click()

            // Passo 5 — Collaboratori
            await expect(page.getByTestId("wizard-step-title")).toHaveText(/invita i collaboratori/i)
            await page.getByTestId("wizard-skip").click()

            await expect(page.getByTestId("wizard-completed")).toBeVisible()
            await expect(page.getByText("Progetto pronto!")).toBeVisible()
        })

        test("given the first step, when the project name is missing, then the wizard stays where it is", async ({ browser }) => {
            const page = await openWizard(browser)

            await page.getByTestId("wizard-next").click()

            await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
        })

        test("given the second step, when going back, then the previous step is shown again", async ({ browser }) => {
            const page = await openWizard(browser)

            await fillNameAndContinue(page, `E2E Back ${suffix}`)
            await expect(page.getByTestId("wizard-step-title")).toHaveText(/configura gli ambienti/i)

            await page.getByTestId("wizard-back").click()
            await expect(page.getByTestId("wizard-step-title")).toHaveText(/nome al progetto/i)
        })

        test("given the collaborators step, when a row is added, then another email field appears", async ({ browser }) => {
            const page = await openWizard(browser)

            await fillNameAndContinue(page, `E2E Collab ${suffix}`)
            await chooseEnvironmentPresetAndSave(page, "Ambienti Standard")
            await page.getByTestId("storage-cancel").click()
            await page.getByTestId("wizard-skip").click()

            await expect(page.getByTestId("wizard-step-title")).toHaveText(/invita i collaboratori/i)
            await page.getByTestId("wizard-collaborator-email-0").fill("collega@example.com")
            await page.getByRole("button", { name: /aggiungi collaboratore/i }).click()
            await expect(page.getByTestId("wizard-collaborator-email-1")).toBeVisible()

            // Chiuso senza inviare inviti.
            await page.getByTestId("wizard-skip").click()
            await expect(page.getByTestId("wizard-completed")).toBeVisible()
        })

        test("given the wizard, when it is closed, then the dashboard is shown", async ({ browser }) => {
            const page = await openWizard(browser)

            await page.getByTestId("wizard-close").click()

            await expect(page).toHaveURL(/\/microfrontends/)
        })
    })
