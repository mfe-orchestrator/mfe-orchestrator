import { Browser, expect, test } from "@playwright/test"
import {
    AppSession,
    activateAccountFromEmail,
    createOrganizationViaApi,
    createOrganizationViaUi,
    createProjectViaApi,
    emailDeliveryUnavailable,
    getMineOrganizationsViaApi,
    loginViaApi,
    newTestUser,
    openApp,
    openAppAs,
    registerViaUi
} from "../fixtures/appUser"

/**
 * L'organizzazione dal punto di vista della UI: e' la prima cosa che viene chiesta a un
 * account nuovo, ed e' quello che restringe la lista dei progetti.
 *
 * Il secondo progetto viene creato via API: qui interessa il cambio di organizzazione,
 * non ripetere il wizard che ha i suoi test in project-wizard.spec.ts.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE) e SMTP
 * configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Organization selection from the UI", () => {
        const owner = newTestUser("orgswitch")
        const suffix = Date.now().toString(36)
        const firstOrganization = `E2E Org uno ${suffix}`
        const secondOrganization = `E2E Org due ${suffix}`
        const firstProject = `E2E Progetto uno ${suffix}`
        const secondProject = `E2E Progetto due ${suffix}`

        let session: AppSession | undefined
        let accessToken: string
        let firstOrganizationId: string
        let secondOrganizationId: string

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        /** Passa all'organizzazione indicata dallo switcher in header e aspetta che sia quella attiva. */
        const switchTo = async (browser: Browser, organizationId: string) => {
            const { page } = await getSession(browser)
            await page.getByTestId("switch-organization").click()
            await page.getByTestId(`organization-option-${organizationId}`).click()
            await expect(page.getByTestId(`organization-option-${organizationId}`)).toHaveCount(0, { timeout: 30_000 })
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

        test("given a brand new account, when it is registered, then it can be activated from the email link", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)
            await registerViaUi(page, owner)
            await activateAccountFromEmail(page, request, owner)
            await context.close()
        })

        /** Un progetto sta dentro un'organizzazione: senza nessuna, la app chiede prima quella. */
        test("given an account with no organization, when it signs in, then the organization form comes before anything else", async ({ browser, request }) => {
            const { page } = await getSession(browser)

            await expect(page.getByTestId("organization-name")).toBeVisible({ timeout: 30_000 })
            await createOrganizationViaUi(page, firstOrganization)

            accessToken = await loginViaApi(request, owner)
            const organizations = await getMineOrganizationsViaApi(request, accessToken)
            expect(organizations.map(organization => organization.name)).toContain(firstOrganization)
            firstOrganizationId = organizations.find(organization => organization.name === firstOrganization)?._id as string
        })

        test("given the organization just created, when the wizard is submitted, then the project is created inside it", async ({ browser, request }) => {
            const { page } = await getSession(browser)

            // Creata l'organizzazione, il wizard prende il posto della dashboard: non c'e' ancora un progetto.
            await expect(page.getByTestId("wizard-project-name")).toBeVisible({ timeout: 30_000 })
            await page.getByTestId("wizard-project-name").fill(firstProject)
            await page.getByTestId("wizard-next").click()
            await expect(page.getByTestId("wizard-project-name")).toHaveCount(0)

            const response = await request.get(`/api/organizations/${firstOrganizationId}/projects`, { headers: { Authorization: `Bearer ${accessToken}` } })
            expect(response.ok()).toBeTruthy()
            expect(((await response.json()) as Array<{ name: string }>).map(project => project.name)).toContain(firstProject)
        })

        test("given a second organization with its own project, when it is selected, then only its projects are offered", async ({ browser, request }) => {
            secondOrganizationId = (await createOrganizationViaApi(request, accessToken, secondOrganization))._id
            const created = await createProjectViaApi(request, accessToken, secondProject, secondOrganizationId)

            const page = await switchTo(browser, secondOrganizationId)

            // Un solo progetto nella nuova organizzazione: viene selezionato da se'.
            await expect(page.getByTestId("switch-project")).toBeVisible({ timeout: 30_000 })
            await page.getByTestId("switch-project").click()
            await expect(page.getByTestId(`project-option-${created._id}`)).toBeVisible()
            // Il progetto dell'altra organizzazione non e' fra quelli offerti.
            await expect(page.getByText(firstProject, { exact: true })).toHaveCount(0)
        })

        test("given the first organization selected again, when the projects are offered, then its own project is back", async ({ browser }) => {
            const { page } = await getSession(browser)
            await page.keyboard.press("Escape")

            await switchTo(browser, firstOrganizationId)

            await expect(page.getByTestId("switch-project")).toBeVisible({ timeout: 30_000 })
            await page.getByTestId("switch-project").click()
            await expect(page.getByText(firstProject, { exact: true })).toBeVisible()
            await expect(page.getByText(secondProject, { exact: true })).toHaveCount(0)
        })
    })
