import { APIRequestContext, Browser, expect, test } from "@playwright/test"
import {
    AppSession,
    activateAccountFromEmail,
    createOrganizationViaUi,
    emailDeliveryUnavailable,
    loginViaApi,
    newTestUser,
    openApp,
    openAppAs,
    openProjectUsers,
    registerViaUi
} from "../fixtures/appUser"

/**
 * Creazione di un nuovo progetto, dal punto di vista di un account appena nato.
 *
 * Senza progetti la app apre direttamente il wizard invece della dashboard, e il
 * primo passo del wizard e' gia' quello che crea il progetto: il resto della
 * procedura guidata (ambienti, storage, repository, collaboratori) e' coperto da
 * project-wizard.spec.ts e non viene ripetuto qui.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE)
 * e SMTP configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Project creation", () => {
        const owner = newTestUser("project")
        const projectName = `E2E Progetto ${Date.now()}`
        const organizationName = `E2E Org ${Date.now()}`

        // Sessione e token condivisi tra i test: rifarli ogni volta moltiplica le
        // chiamate e fa scattare il rate limit per IP dell'ambiente.
        let session: AppSession | undefined
        let accessToken: string | undefined

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        const myProjects = async (request: APIRequestContext) => {
            accessToken ??= await loginViaApi(request, owner)
            const response = await request.get("/api/projects/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
            expect(response.ok(), `Lettura dei progetti fallita (HTTP ${response.status()})`).toBeTruthy()
            return (await response.json()) as Array<{ name: string; slug: string }>
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

        test("given an account without organizations, when it signs in, then it is asked to create one first", async ({ browser }) => {
            const { page } = await getSession(browser)

            // Un progetto sta dentro un'organizzazione: senza nessuna, la app chiede prima quella.
            await createOrganizationViaUi(page, organizationName)
        })

        test("given an account without projects, when it signs in, then the wizard takes over the dashboard", async ({ browser, request }) => {
            const { page } = await getSession(browser)

            // Il wizard prende il posto della dashboard finche' non c'e' un progetto.
            await expect(page.getByTestId("wizard-step-title")).toBeVisible()
            await expect(page.getByTestId("wizard-project-name")).toBeVisible()

            // Nessun progetto ancora: il wizard non ne ha creato uno solo comparendo.
            expect(await myProjects(request)).toHaveLength(0)
        })

        test("given the wizard, when it is submitted without a name, then it stays on the first step", async ({ browser }) => {
            const { page } = await getSession(browser)

            await page.getByTestId("wizard-next").click()

            // Il campo e' obbligatorio: si resta dove si era.
            await expect(page.getByTestId("wizard-project-name")).toBeVisible()
        })

        test("given the wizard, when a name is submitted, then the project is created and becomes the active one", async ({ browser, request }) => {
            const { page } = await getSession(browser)

            await page.getByTestId("wizard-project-name").fill(projectName)
            await page.getByTestId("wizard-next").click()

            // Passo successivo raggiunto: la creazione e' andata a buon fine.
            await expect(page.getByTestId("wizard-project-name")).toHaveCount(0)

            const projects = await myProjects(request)
            expect(projects.map(project => project.name)).toContain(projectName)

            // Lo slug viene derivato dal nome.
            expect(projects.find(project => project.name === projectName)?.slug).toBe(projectName.toLowerCase().replaceAll(" ", "-"))
        })

        test("given a created project, when the app is reopened, then the project is reachable", async ({ browser }) => {
            const { page } = await getSession(browser)

            // Un solo progetto: viene selezionato in automatico e la app si apre su di esso.
            await openProjectUsers(page)
            await expect(page.getByTestId(`project-member-${owner.email}`)).toBeVisible()
        })
    })
