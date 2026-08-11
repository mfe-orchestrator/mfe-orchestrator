import { APIRequestContext, Browser, expect, test } from "@playwright/test"
import { AppSession, activateAccountFromEmail, createProjectViaApi, emailDeliveryUnavailable, loginViaApi, newTestUser, openApp, openAppAs, registerViaUi } from "../fixtures/appUser"
import { createEnvironmentViaApi, getEnvironmentsViaApi } from "../fixtures/projectResources"

/**
 * CRUD degli ambienti dalla pagina /environments.
 *
 * Il progetto parte con un ambiente creato via API: senza nemmeno uno la pagina
 * mostra il placeholder con i preset invece della tabella, e il bottone di
 * creazione non c'e'.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE)
 * e SMTP configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Environments CRUD", () => {
        const owner = newTestUser("env")
        const suffix = Date.now().toString(36).toUpperCase()
        const seeded = { name: `Seed ${suffix}`, slug: `SEED-${suffix}` }
        const created = { name: `Staging ${suffix}`, slug: `STAGING-${suffix}` }
        const renamed = `Collaudo ${suffix}`

        let session: AppSession | undefined
        let accessToken: string
        let projectId: string

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        const environments = (request: APIRequestContext) => getEnvironmentsViaApi(request, accessToken, projectId)

        const openEnvironments = async (browser: Browser) => {
            const { page } = await getSession(browser)
            await page.goto("/environments")
            // Chunk lazy dentro ApiStatusHandler: a freddo i 5s di default non bastano.
            await expect(page.getByTestId(`environment-row-${seeded.slug}`)).toBeVisible({ timeout: 30_000 })
            return page
        }

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test.afterAll(async () => {
            await session?.context.close()
        })

        test("given a new account, when it is registered and activated, then a project with one environment can be prepared", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)
            await registerViaUi(page, owner)
            await activateAccountFromEmail(page, request, owner)
            await context.close()

            accessToken = await loginViaApi(request, owner)
            const project = await createProjectViaApi(request, accessToken, `E2E Env ${suffix}`)
            projectId = project._id

            await createEnvironmentViaApi(request, accessToken, projectId, seeded)
            expect((await environments(request)).map(environment => environment.slug)).toContain(seeded.slug)
        })

        test("given the environments page, when it is opened, then the existing environments are listed", async ({ browser }) => {
            const page = await openEnvironments(browser)

            const row = page.getByTestId(`environment-row-${seeded.slug}`)
            await expect(row).toContainText(seeded.name)
            await expect(row).toContainText(seeded.slug)
        })

        test("given the create dialog, when a name and a slug are submitted, then the environment is created", async ({ browser, request }) => {
            const page = await openEnvironments(browser)

            await page.getByTestId("environment-new").click()
            await page.getByTestId("environment-name").fill(created.name)
            await page.getByTestId("environment-slug").fill(created.slug)
            await page.getByTestId("environment-submit").click()

            await expect(page.getByTestId(`environment-row-${created.slug}`)).toBeVisible()
            expect((await environments(request)).map(environment => environment.slug)).toContain(created.slug)
        })

        test("given the create dialog, when the name is missing, then the environment is not created", async ({ browser, request }) => {
            const page = await openEnvironments(browser)
            const before = (await environments(request)).length

            await page.getByTestId("environment-new").click()
            await page.getByTestId("environment-submit").click()

            // Campo obbligatorio: il dialog resta aperto e non viene creato nulla.
            await expect(page.getByTestId("environment-name")).toBeVisible()
            expect(await environments(request)).toHaveLength(before)

            await page.keyboard.press("Escape")
        })

        test("given an existing environment, when it is renamed, then the new name is persisted", async ({ browser, request }) => {
            const page = await openEnvironments(browser)

            await page.getByTestId(`environment-edit-${created.slug}`).click()
            await page.getByTestId("environment-name").fill(renamed)
            await page.getByTestId("environment-submit").click()

            await expect(page.getByTestId(`environment-row-${created.slug}`)).toContainText(renamed)
            expect((await environments(request)).find(environment => environment.slug === created.slug)?.name).toBe(renamed)
        })

        test("given an existing environment, when it is deleted, then it disappears from the project", async ({ browser, request }) => {
            const page = await openEnvironments(browser)

            await page.getByTestId(`environment-delete-${created.slug}`).click()
            await page.getByRole("button", { name: "Elimina", exact: true }).click()

            await expect(page.getByTestId(`environment-row-${created.slug}`)).toHaveCount(0)
            expect((await environments(request)).map(environment => environment.slug)).not.toContain(created.slug)
        })
    })
