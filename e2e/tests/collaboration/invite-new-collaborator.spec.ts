import { expect, test } from "@playwright/test"
import {
    activateAccountFromEmail,
    createProjectViaApi,
    emailDeliveryUnavailable,
    inviteCollaboratorViaUi,
    loginViaApi,
    loginViaUi,
    newTestUser,
    openApp,
    openInvitationFromEmail,
    RoleInProject,
    registerViaUi
} from "../fixtures/appUser"

/**
 * Scenario 1 — invito a un collaboratore che non ha ancora un account.
 *
 * 1. L'owner si registra con una casella di test e attiva l'account dal link ricevuto.
 * 2. Dalla pagina membri invita un collaboratore, anche lui su una casella di test.
 * 3. Il collaboratore accetta l'invito dall'email, sceglie la password ed entra
 *    nel portale trovandosi il progetto gia' assegnato.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE),
 * SMTP configurato sul backend (`EMAIL_SMTP_HOST`) e almeno un utente gia' presente
 * in ambiente, altrimenti la app mostra la schermata di primo avvio al posto della
 * registrazione. Se manca qualcosa i test si auto-escludono spiegando il motivo.
 */
test.describe
    .serial("Invito di un nuovo collaboratore", () => {
        const owner = newTestUser("owner")
        const collaborator = newTestUser("collab")
        const projectName = `E2E Collab ${Date.now()}`

        test.beforeEach(async ({ request }) => {
            // Il test attende la consegna di email vere: il timeout di default (30s) non basta.
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test("l'owner si registra con una casella di test e attiva l'account", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)

            await registerViaUi(page, owner)
            await activateAccountFromEmail(page, request, owner)

            // Account attivo: le credenziali funzionano.
            expect(await loginViaApi(request, owner)).toBeTruthy()

            await context.close()
        })

        test("l'owner invita un collaboratore sul proprio progetto", async ({ browser, request }) => {
            const accessToken = await loginViaApi(request, owner)
            const project = await createProjectViaApi(request, accessToken, projectName)
            expect(project._id).toBeTruthy()

            const { context, page } = await openApp(browser)
            await loginViaUi(page, owner)

            await inviteCollaboratorViaUi(page, collaborator.email, RoleInProject.MEMBER)

            // L'invito compare subito tra quelli in sospeso.
            await expect(page.getByTestId(`pending-invite-${collaborator.email}`)).toBeVisible()

            await context.close()
        })

        test("il collaboratore accetta l'invito dall'email e trova il progetto assegnato", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)

            await openInvitationFromEmail(page, request, collaborator, projectName)

            // Utente nuovo: la pagina di invito chiede di impostare la password.
            await expect(page.getByTestId("invitation-password")).toBeVisible()
            await page.getByTestId("invitation-password").fill(collaborator.password)
            await page.getByTestId("invitation-confirm-password").fill(collaborator.password)
            await page.getByTestId("accept-invitation").click()

            await expect(page).not.toHaveURL(/\/project-invitation\//)

            await context.close()
        })

        test("il collaboratore accede al portale e vede il progetto tra i suoi", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)

            await loginViaUi(page, collaborator)

            // Un solo progetto: viene selezionato in automatico e la app si apre su di esso.
            await page.goto("/project-users")
            await expect(page.getByTestId(`project-member-${collaborator.email}`)).toBeVisible()
            await expect(page.getByTestId(`project-member-${owner.email}`)).toBeVisible()

            // L'invito non e' piu' in sospeso.
            await expect(page.getByTestId(`pending-invite-${collaborator.email}`)).toHaveCount(0)

            // Il progetto risulta assegnato anche lato API.
            const accessToken = await loginViaApi(request, collaborator)
            const response = await request.get("/api/projects/mine", {
                headers: { Authorization: `Bearer ${accessToken}` }
            })
            expect(response.ok()).toBeTruthy()
            expect((await response.json()).map((project: { name: string }) => project.name)).toContain(projectName)

            await context.close()
        })
    })
