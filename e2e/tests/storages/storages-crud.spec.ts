import { APIRequestContext, Browser, expect, Page, test } from "@playwright/test"
import { AppSession, activateAccountFromEmail, createProjectViaApi, emailDeliveryUnavailable, loginViaApi, newTestUser, openApp, openAppAs, registerViaUi } from "../fixtures/appUser"
import { getStoragesViaApi } from "../fixtures/projectResources"

/**
 * CRUD degli storage provider dalle pagine /storages e /storages/:id.
 *
 * Si usa un provider AWS con credenziali finte: la app salva la configurazione
 * senza contattare il provider, quindi non serve un bucket vero.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE)
 * e SMTP configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Storage providers CRUD", () => {
        const owner = newTestUser("storage")
        const suffix = Date.now().toString(36)
        const storageName = `E2E storage ${suffix}`
        const renamed = `E2E storage rinominato ${suffix}`

        let session: AppSession | undefined
        let accessToken: string
        let projectId: string

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        const storages = (request: APIRequestContext) => getStoragesViaApi(request, accessToken, projectId)

        const openStorages = async (browser: Browser): Promise<Page> => {
            const { page } = await getSession(browser)
            await page.goto("/storages")
            // Chunk lazy dentro ApiStatusHandler: a freddo i 5s di default non bastano.
            await expect(page.getByTestId("storage-new")).toBeVisible({ timeout: 30_000 })
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

        test("given a new account, when it is registered and activated, then a project without storages is available", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)
            await registerViaUi(page, owner)
            await activateAccountFromEmail(page, request, owner)
            await context.close()

            accessToken = await loginViaApi(request, owner)
            const project = await createProjectViaApi(request, accessToken, `E2E Storage ${suffix}`)
            projectId = project._id

            expect(await storages(request)).toHaveLength(0)
        })

        test("given the storage form, when an AWS bucket is submitted, then the storage is created", async ({ browser, request }) => {
            const page = await openStorages(browser)

            await page.getByTestId("storage-new").click()

            // AWS e' il tipo preselezionato, con la region gia' valorizzata.
            await page.getByTestId("storage-name").fill(storageName)
            await page.getByTestId("storage-bucket-name").fill(`e2e-bucket-${suffix}`)
            await page.getByTestId("storage-access-key-id").fill("AKIAE2ETESTONLY")
            await page.getByTestId("storage-secret-access-key").fill("e2e-secret-not-a-real-key")
            await page.getByTestId("storage-submit").click()

            await expect(page.getByTestId(`storage-row-${storageName}`)).toBeVisible({ timeout: 30_000 })

            const created = (await storages(request)).find(storage => storage.name === storageName)
            expect(created).toBeTruthy()
            expect(created?.authConfig?.bucketName).toBe(`e2e-bucket-${suffix}`)
        })

        test("given the storages page, when it is opened, then the storage is listed with its bucket", async ({ browser }) => {
            const page = await openStorages(browser)

            const row = page.getByTestId(`storage-row-${storageName}`)
            await expect(row).toBeVisible()
            await expect(row).toContainText(`e2e-bucket-${suffix}`)
        })

        test("given an existing storage, when it is renamed, then the new name is persisted", async ({ browser, request }) => {
            const page = await openStorages(browser)

            await page.getByTestId(`storage-edit-${storageName}`).click()
            await expect(page.getByTestId("storage-name")).toHaveValue(storageName, { timeout: 30_000 })

            await page.getByTestId("storage-name").fill(renamed)
            await page.getByTestId("storage-submit").click()

            await expect(page.getByTestId(`storage-row-${renamed}`)).toBeVisible({ timeout: 30_000 })
            expect((await storages(request)).map(storage => storage.name)).toContain(renamed)
        })

        test("given an existing storage, when it is deleted, then it disappears from the project", async ({ browser, request }) => {
            const page = await openStorages(browser)

            await page.getByTestId(`storage-delete-${renamed}`).click()
            await page.getByRole("button", { name: "Elimina", exact: true }).click()

            await expect(page.getByTestId(`storage-row-${renamed}`)).toHaveCount(0)
            expect((await storages(request)).map(storage => storage.name)).not.toContain(renamed)
        })
    })
