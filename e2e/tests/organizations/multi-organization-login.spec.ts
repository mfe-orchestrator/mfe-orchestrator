import { APIRequestContext, Browser, expect, Page, test } from "@playwright/test"
import {
    AppSession,
    activateAccountFromEmail,
    createOrganizationViaApi,
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
 * Login di un utente che sta in piu' organizzazioni, con piu' progetti in una di
 * esse: quello che la app deve chiedere, quello che decide da se' e quello che si
 * ricorda al giro successivo.
 *
 * Le due schermate di scelta stanno sopra la app (Routes.tsx: SelectOrganizationWrapper
 * avvolge SelectProjectWrapper, che avvolge le pagine), quindi l'header con gli
 * switcher esiste solo a scelta conclusa. Da qui i tre stati riconoscibili:
 *   - scelta dell'organizzazione: `organization-option-*`, nessuno switcher;
 *   - scelta del progetto: `project-option-*` e solo `switch-organization`;
 *   - dentro la app: `switch-project`.
 *
 * Organizzazioni e progetti vengono creati via API: il wizard e la creazione hanno
 * i loro test dedicati, qui interessa solo lo stato di partenza.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE) e SMTP
 * configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Login and selection with several organizations and projects", () => {
        const owner = newTestUser("multiorg")
        const suffix = Date.now().toString(36)
        const alfaOrganization = `E2E Org Alfa ${suffix}`
        const betaOrganization = `E2E Org Beta ${suffix}`
        const alfaFirstProject = `E2E Alfa uno ${suffix}`
        const alfaSecondProject = `E2E Alfa due ${suffix}`
        const betaProject = `E2E Beta uno ${suffix}`

        // Sessione e token condivisi tra i test: rifare login e bootstrap a ogni test
        // moltiplica le chiamate e fa scattare il rate limit per IP dell'ambiente.
        let session: AppSession | undefined
        let accessToken: string
        let alfaId: string
        let betaId: string
        let alfaFirstId: string
        let alfaSecondId: string
        let betaProjectId: string

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        /** Organizzazione e progetto ricordati dal browser: e' da qui che riparte il login successivo. */
        const storedSelection = (page: Page) =>
            page.evaluate(() => ({
                organizationId: localStorage.getItem("organizationId"),
                projectId: localStorage.getItem("projectId")
            }))

        /**
         * La app e' ancora alla scelta dell'organizzazione.
         *
         * Le opzioni da sole non bastano a dirlo: le stesse compaiono nel dialogo dello
         * switcher in header. Quello che distingue la schermata e' che l'header non c'e'.
         */
        const expectOrganizationChoice = async (page: Page) => {
            await expect(page.getByTestId(`organization-option-${alfaId}`)).toBeVisible({ timeout: 30_000 })
            await expect(page.getByTestId(`organization-option-${betaId}`)).toBeVisible()
            await expect(page.getByTestId("switch-organization")).toHaveCount(0)
            await expect(page.getByTestId("switch-project")).toHaveCount(0)
        }

        /** Cambia organizzazione dallo switcher in header e aspetta che il selettore si chiuda. */
        const switchOrganizationFromApp = async (page: Page, organizationId: string) => {
            await page.getByTestId("switch-organization").click()
            // Il pulsante apre il menu dell'organizzazione: la lista sta dietro "Cambia organizzazione".
            await page.getByTestId("organization-switch-action").click()

            const option = page.getByTestId(`organization-option-${organizationId}`)
            await option.click()
            await expect(option).toHaveCount(0, { timeout: 30_000 })
        }

        /** I progetti dell'organizzazione, letti dal server. */
        const organizationProjects = async (request: APIRequestContext, organizationId: string) => {
            const response = await request.get(`/api/organizations/${organizationId}/projects`, { headers: { Authorization: `Bearer ${accessToken}` } })
            expect(response.ok(), `Lettura progetti dell'organizzazione fallita (HTTP ${response.status()})`).toBeTruthy()
            return ((await response.json()) as Array<{ name: string }>).map(project => project.name)
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

        test("given an activated account, when two organizations are seeded, then each one holds only its own projects", async ({ request }) => {
            accessToken = await loginViaApi(request, owner)

            alfaId = (await createOrganizationViaApi(request, accessToken, alfaOrganization))._id
            betaId = (await createOrganizationViaApi(request, accessToken, betaOrganization))._id

            // Alfa con due progetti, Beta con uno solo: e' la differenza che decide se la app
            // chiede quale progetto usare o lo sceglie da se'.
            alfaFirstId = (await createProjectViaApi(request, accessToken, alfaFirstProject, alfaId))._id
            alfaSecondId = (await createProjectViaApi(request, accessToken, alfaSecondProject, alfaId))._id
            betaProjectId = (await createProjectViaApi(request, accessToken, betaProject, betaId))._id

            const organizations = (await getMineOrganizationsViaApi(request, accessToken)).map(organization => organization.name)
            expect(organizations).toContain(alfaOrganization)
            expect(organizations).toContain(betaOrganization)

            // Confronto senza ordine: l'endpoint non promette quello di creazione.
            expect((await organizationProjects(request, alfaId)).sort()).toEqual([alfaFirstProject, alfaSecondProject].sort())
            expect(await organizationProjects(request, betaId)).toEqual([betaProject])
        })

        test("given an account in more than one organization, when it signs in, then the organization is asked before the app opens", async ({ browser }) => {
            const { page } = await getSession(browser)

            // Con una sola organizzazione la app la sceglierebbe da se': con due non puo' indovinare.
            await expectOrganizationChoice(page)
        })

        test("given the organization choice, when the one with several projects is picked, then only its projects are offered", async ({ browser }) => {
            const { page } = await getSession(browser)

            await page.getByTestId(`organization-option-${alfaId}`).click()

            await expect(page.getByTestId(`project-option-${alfaFirstId}`)).toBeVisible({ timeout: 30_000 })
            await expect(page.getByTestId(`project-option-${alfaSecondId}`)).toBeVisible()
            // Il progetto dell'altra organizzazione non e' fra quelli offerti.
            await expect(page.getByTestId(`project-option-${betaProjectId}`)).toHaveCount(0)
            // Ancora fuori dalla app: la scelta del progetto viene prima.
            await expect(page.getByTestId("switch-project")).toHaveCount(0)
        })

        test("given the project choice, when a project is picked, then the app opens on it and remembers the pair", async ({ browser }) => {
            const { page } = await getSession(browser)

            await page.getByTestId(`project-option-${alfaFirstId}`).click()

            // Header a video: entrambe le scelte sono concluse.
            await expect(page.getByTestId("switch-project")).toBeVisible({ timeout: 30_000 })
            await expect(page.getByTestId("switch-organization")).toContainText(alfaOrganization)
            expect(await storedSelection(page)).toEqual({ organizationId: alfaId, projectId: alfaFirstId })
        })

        test("given an organization and a project already chosen, when the page is reloaded, then both are restored without asking again", async ({ browser }) => {
            const { page } = await getSession(browser)

            await page.reload()

            await expect(page.getByTestId("switch-project")).toBeVisible({ timeout: 30_000 })
            // Nessuna delle due schermate di scelta e' ricomparsa.
            await expect(page.getByTestId(`organization-option-${betaId}`)).toHaveCount(0)
            await expect(page.getByTestId(`project-option-${alfaSecondId}`)).toHaveCount(0)
            expect(await storedSelection(page)).toEqual({ organizationId: alfaId, projectId: alfaFirstId })
        })

        test("given the selection already made, when the same account signs in from another browser, then the organization is asked again", async ({ browser }) => {
            // La scelta sta nel localStorage, non sul server: un browser nuovo riparte da zero.
            const { context, page } = await openAppAs(browser, owner)

            await expectOrganizationChoice(page)

            await context.close()
        })

        test("given an organization with a single project, when it is selected, then its project is chosen automatically", async ({ browser }) => {
            const { page } = await getSession(browser)

            await switchOrganizationFromApp(page, betaId)

            // Un solo progetto: la app non ha nulla da chiedere e ci entra da se'.
            await expect(page.getByTestId("switch-project")).toBeVisible({ timeout: 30_000 })
            await expect(page.getByTestId("switch-organization")).toContainText(betaOrganization)
            await page.waitForFunction(expected => localStorage.getItem("projectId") === expected, betaProjectId, { timeout: 30_000 })
            expect(await storedSelection(page)).toEqual({ organizationId: betaId, projectId: betaProjectId })
        })

        test("given a project in use, when the organization is switched to one with several projects, then the project is not carried over", async ({ browser }) => {
            const { page } = await getSession(browser)

            await switchOrganizationFromApp(page, alfaId)

            // Il progetto di prima stava nell'altra organizzazione: viene dimenticato, e con due
            // candidati la app torna a chiedere quale usare.
            await expect(page.getByTestId(`project-option-${alfaFirstId}`)).toBeVisible({ timeout: 30_000 })
            await expect(page.getByTestId(`project-option-${alfaSecondId}`)).toBeVisible()
            await expect(page.getByTestId("switch-project")).toHaveCount(0)
            expect((await storedSelection(page)).projectId).toBeNull()
        })
    })
