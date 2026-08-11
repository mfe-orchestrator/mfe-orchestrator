import { APIRequestContext, Browser, expect, test } from "@playwright/test"
import { AppSession, activateAccountFromEmail, createProjectViaApi, emailDeliveryUnavailable, loginViaApi, newTestUser, openApp, openAppAs, registerViaUi } from "../fixtures/appUser"
import { getApiKeysViaApi } from "../fixtures/projectResources"

/**
 * CRUD delle API key dalla pagina /api-keys.
 *
 * Le API key non si aggiornano: si creano, si leggono e si revocano. Il valore
 * in chiaro viene mostrato una volta sola, al momento della creazione.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE)
 * e SMTP configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("API keys CRUD", () => {
        const owner = newTestUser("apikey")
        const suffix = Date.now().toString(36)
        const keyName = `E2E key ${suffix}`

        let session: AppSession | undefined
        let accessToken: string
        let projectId: string

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        const apiKeys = (request: APIRequestContext) => getApiKeysViaApi(request, accessToken, projectId)

        const openApiKeys = async (browser: Browser) => {
            const { page } = await getSession(browser)
            await page.goto("/api-keys")
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

        test("given a new account, when it is registered and activated, then a project without API keys is available", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)
            await registerViaUi(page, owner)
            await activateAccountFromEmail(page, request, owner)
            await context.close()

            accessToken = await loginViaApi(request, owner)
            const project = await createProjectViaApi(request, accessToken, `E2E ApiKey ${suffix}`)
            projectId = project._id

            expect(await apiKeys(request)).toHaveLength(0)
        })

        test("given a project without API keys, when the page is opened, then the empty state offers to create one", async ({ browser }) => {
            const page = await openApiKeys(browser)

            // Senza chiavi la tabella non c'e': resta il placeholder, con il suo bottone.
            await expect(page.getByTestId("api-key-create")).toBeVisible({ timeout: 30_000 })
        })

        test("given the create dialog, when a name is submitted, then the key is created and shown once", async ({ browser, request }) => {
            const page = await openApiKeys(browser)

            await page.getByTestId("api-key-create").click()
            await page.getByTestId("api-key-name").fill(keyName)
            await page.getByTestId("api-key-submit").click()

            // Il valore in chiaro compare solo qui.
            const secret = page.getByTestId("api-key-value")
            await expect(secret).toBeVisible()
            expect((await secret.textContent())?.trim()).toBeTruthy()

            await page.getByTestId("api-key-close").click()

            await expect(page.getByTestId(`api-key-row-${keyName}`)).toBeVisible()
            expect((await apiKeys(request)).map(key => key.name)).toContain(keyName)
        })

        test("given an existing key, when the page is reopened, then the secret is no longer shown", async ({ browser }) => {
            const page = await openApiKeys(browser)

            const row = page.getByTestId(`api-key-row-${keyName}`)
            await expect(row).toBeVisible({ timeout: 30_000 })
            await expect(row).toContainText(keyName)
            await expect(page.getByTestId("api-key-value")).toHaveCount(0)
        })

        test("given an existing key, when it is revoked, then it disappears from the project", async ({ browser, request }) => {
            const page = await openApiKeys(browser)

            await expect(page.getByTestId(`api-key-row-${keyName}`)).toBeVisible({ timeout: 30_000 })
            await page.getByTestId(`api-key-delete-${keyName}`).click()
            await page.getByRole("button", { name: "Elimina", exact: true }).click()

            await expect(page.getByTestId(`api-key-row-${keyName}`)).toHaveCount(0)
            expect((await apiKeys(request)).map(key => key.name)).not.toContain(keyName)
        })
    })
