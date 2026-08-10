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
import { waitForMessage } from "../fixtures/emailClient"

/**
 * Scenario 2 — invito a un utente che ha gia' un account.
 *
 * 1. Utente 1 e utente 2 si registrano entrambi con una casella di test.
 * 2. Utente 1 invita utente 2 sul proprio progetto con il ruolo Editore.
 * 3. Utente 2 riceve l'email di invito al progetto.
 * 4. Utente 1, dentro il proprio progetto, vede l'invito in sospeso verso utente 2.
 * 5. Utente 2 accetta: avendo gia' una password non gliene viene chiesta una nuova
 *    e compare tra i membri del progetto.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE),
 * SMTP configurato sul backend (`EMAIL_SMTP_HOST`) e almeno un utente gia' presente
 * in ambiente. Se manca qualcosa i test si auto-escludono spiegando il motivo.
 */
test.describe
    .serial("Invito di un utente gia' registrato", () => {
        const userOne = newTestUser("user1")
        const userTwo = newTestUser("user2")
        const projectName = `E2E Invito ${Date.now()}`

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test("entrambi gli utenti si registrano con una casella di test", async ({ browser, request }) => {
            for (const user of [userOne, userTwo]) {
                const { context, page } = await openApp(browser)
                await registerViaUi(page, user)
                await activateAccountFromEmail(page, request, user)
                expect(await loginViaApi(request, user)).toBeTruthy()
                await context.close()
            }
        })

        test("l'utente 1 invita l'utente 2 sul proprio progetto come Editore", async ({ browser, request }) => {
            const accessToken = await loginViaApi(request, userOne)
            await createProjectViaApi(request, accessToken, projectName)

            const { context, page } = await openApp(browser)
            await loginViaUi(page, userOne)

            await inviteCollaboratorViaUi(page, userTwo.email, RoleInProject.MEMBER)

            await context.close()
        })

        test("l'utente 2 riceve l'email di invito al progetto", async ({ request }) => {
            const message = await waitForMessage(request, userTwo.inbox, {
                subject: `You're invited to join ${projectName}`
            })
            expect(message.subject).toContain(projectName)
        })

        test("l'utente 1 vede l'invito in sospeso dentro il proprio progetto", async ({ browser }) => {
            const { context, page } = await openApp(browser)
            await loginViaUi(page, userOne)
            await page.goto("/project-users")

            const pendingInvites = page.getByTestId("pending-invites")
            await expect(pendingInvites).toBeVisible()

            const invite = page.getByTestId(`pending-invite-${userTwo.email}`)
            await expect(invite).toBeVisible()
            await expect(invite).toContainText(userTwo.email)
            await expect(invite).toContainText(RoleInProject.MEMBER)

            // Finche' l'invito e' in sospeso l'utente 2 non e' ancora un membro.
            await expect(page.getByTestId(`project-member-${userTwo.email}`)).toHaveCount(0)

            await context.close()
        })

        test("l'utente 2 accetta l'invito senza dover impostare una nuova password", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)

            await openInvitationFromEmail(page, request, userTwo, projectName)

            // Account gia' esistente: nessun campo password, solo l'accettazione.
            await expect(page.getByTestId("accept-invitation")).toBeVisible()
            await expect(page.getByTestId("invitation-password")).toHaveCount(0)
            await page.getByTestId("accept-invitation").click()

            await expect(page).not.toHaveURL(/\/project-invitation\//)

            await page.goto("/project-users")
            await expect(page.getByTestId(`project-member-${userTwo.email}`)).toBeVisible()

            await context.close()
        })

        test("l'utente 1 vede l'utente 2 tra i membri e non piu' tra gli inviti in sospeso", async ({ browser }) => {
            const { context, page } = await openApp(browser)
            await loginViaUi(page, userOne)
            await page.goto("/project-users")

            await expect(page.getByTestId(`project-member-${userTwo.email}`)).toBeVisible()
            await expect(page.getByTestId(`pending-invite-${userTwo.email}`)).toHaveCount(0)

            await context.close()
        })
    })
