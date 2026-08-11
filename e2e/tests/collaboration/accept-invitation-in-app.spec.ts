import { Browser, expect, test } from "@playwright/test"
import {
    AppSession,
    activateAccountFromEmail,
    createProjectViaApi,
    emailDeliveryUnavailable,
    getMineProjectsViaApi,
    ISSUER,
    inviteCollaboratorViaApi,
    loginViaApi,
    newTestUser,
    openApp,
    openAppAs,
    RoleInProject,
    registerViaUi
} from "../fixtures/appUser"

/**
 * Scenario 3 — invito accettato da dentro la app, senza passare dal link email.
 *
 * Un invito in sospeso non e' un'appartenenza: finche' non viene accettato il
 * progetto non deve comparire tra i propri ne' essere leggibile, e all'utente
 * va chiesto se accettare o rifiutare.
 *
 * Prerequisiti: gli stessi degli altri test di collaborazione (testmail.app +
 * SMTP configurato). Senza email il backend aggiunge i collaboratori
 * direttamente, quindi non esiste nessun invito in sospeso da accettare.
 */
test.describe
    .serial("Invitation answered from inside the app", () => {
        const owner = newTestUser("owner")
        const invitee = newTestUser("invitee")
        const projectName = `E2E Invito in app ${Date.now()}`

        let projectId: string | undefined
        // La sessione dell'invitato resta aperta: rifare login a ogni test fa scattare il rate limit per IP.
        let inviteeSession: AppSession | undefined

        const getInviteeSession = async (browser: Browser): Promise<AppSession> => {
            inviteeSession ??= await openAppAs(browser, invitee)
            return inviteeSession
        }

        test.afterAll(async () => {
            await inviteeSession?.context.close()
        })

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test("given two brand new accounts, when they are registered, then both can be activated from the email link", async ({ browser, request }) => {
            for (const user of [owner, invitee]) {
                const { context, page } = await openApp(browser)
                await registerViaUi(page, user)
                await activateAccountFromEmail(page, request, user)
                expect(await loginViaApi(request, user)).toBeTruthy()
                await context.close()
            }
        })

        test("given a pending invitation, when the invited user lists their projects, then the project is not one of them", async ({ request }) => {
            const ownerToken = await loginViaApi(request, owner)
            const project = await createProjectViaApi(request, ownerToken, projectName)
            projectId = project._id

            await inviteCollaboratorViaApi(request, ownerToken, project._id, invitee.email, RoleInProject.MEMBER)

            const inviteeToken = await loginViaApi(request, invitee)
            const projects = await getMineProjectsViaApi(request, inviteeToken)
            expect(projects.map(p => p.name)).not.toContain(projectName)
        })

        test("given a pending invitation, when the invited user reads the project, then access is denied", async ({ request }) => {
            const inviteeToken = await loginViaApi(request, invitee)

            const response = await request.get(`/api/projects/${projectId}`, {
                headers: { Authorization: `Bearer ${inviteeToken}`, issuer: ISSUER }
            })
            expect(response.ok(), "Un invito in sospeso non deve dare accesso al progetto").toBeFalsy()
        })

        test("given a pending invitation, when the invited user opens the app, then the invitation is offered instead of the project", async ({ browser }) => {
            const { page } = await getInviteeSession(browser)

            const invitations = page.getByTestId("pending-invitations")
            await expect(invitations).toBeVisible({ timeout: 30_000 })
            await expect(invitations).toContainText(projectName)
            await expect(page.getByTestId(`accept-invitation-${projectId}`)).toBeVisible()
            await expect(page.getByTestId(`decline-invitation-${projectId}`)).toBeVisible()
        })

        test("given an offered invitation, when the invited user accepts it, then the project becomes one of theirs", async ({ browser, request }) => {
            const { page } = await getInviteeSession(browser)

            await page.getByTestId(`accept-invitation-${projectId}`).click()
            await expect(page.getByTestId("pending-invitations")).toHaveCount(0)

            const inviteeToken = await loginViaApi(request, invitee)
            const projects = await getMineProjectsViaApi(request, inviteeToken)
            expect(projects.map(p => p.name)).toContain(projectName)
        })
    })
