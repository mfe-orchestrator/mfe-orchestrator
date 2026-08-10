import { APIRequestContext, Browser, expect, test } from "@playwright/test"
import { AppSession, activateAccountFromEmail, emailDeliveryUnavailable, loginViaApi, newTestUser, openApp, openAppAs, openProjectUsers, registerViaUi } from "../fixtures/appUser"

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
    .serial("Creazione di un progetto", () => {
        const owner = newTestUser("project")
        const projectName = `E2E Progetto ${Date.now()}`

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

        test("un nuovo utente si registra e attiva l'account", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)

            await registerViaUi(page, owner)
            await activateAccountFromEmail(page, request, owner)

            await context.close()
        })

        test("al primo accesso, senza progetti, si viene portati nel wizard", async ({ browser, request }) => {
            const { page } = await getSession(browser)

            // Il wizard prende il posto della dashboard finche' non c'e' un progetto.
            await expect(page.getByTestId("wizard-step-title")).toBeVisible()
            await expect(page.getByTestId("wizard-project-name")).toBeVisible()

            // Nessun progetto ancora: il wizard non ne ha creato uno solo comparendo.
            expect(await myProjects(request)).toHaveLength(0)
        })

        test("senza nome il wizard resta sul primo passo", async ({ browser }) => {
            const { page } = await getSession(browser)

            await page.getByTestId("wizard-next").click()

            // Il campo e' obbligatorio: si resta dove si era.
            await expect(page.getByTestId("wizard-project-name")).toBeVisible()
        })

        test("dando un nome il progetto viene creato e diventa quello attivo", async ({ browser, request }) => {
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

        test("il progetto creato e' raggiungibile dalla app", async ({ browser }) => {
            const { page } = await getSession(browser)

            // Un solo progetto: viene selezionato in automatico e la app si apre su di esso.
            await openProjectUsers(page)
            await expect(page.getByTestId(`project-member-${owner.email}`)).toBeVisible()
        })
    })
