import { Browser, expect, test } from "@playwright/test"
import {
    AppSession,
    activateAccountFromEmail,
    createProjectViaApi,
    emailDeliveryUnavailable,
    inviteCollaboratorViaUi,
    loginViaApi,
    newTestUser,
    openApp,
    openAppAs,
    openInvitationFromEmail,
    openProjectUsers,
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
    .serial("Invitation of an already registered user", () => {
        const userOne = newTestUser("user1")
        const userTwo = newTestUser("user2")
        const projectName = `E2E Invito ${Date.now()}`

        // La sessione dell'utente 1 resta aperta per tutto lo scenario: rifare login
        // e bootstrap a ogni test fa scattare il rate limit per IP dell'ambiente.
        let userOneSession: AppSession | undefined

        const getUserOneSession = async (browser: Browser): Promise<AppSession> => {
            userOneSession ??= await openAppAs(browser, userOne)
            return userOneSession
        }

        test.afterAll(async () => {
            await userOneSession?.context.close()
        })

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test("given two brand new accounts, when they are registered, then both can be activated from the email link", async ({ browser, request }) => {
            for (const user of [userOne, userTwo]) {
                const { context, page } = await openApp(browser)
                await registerViaUi(page, user)
                await activateAccountFromEmail(page, request, user)
                expect(await loginViaApi(request, user)).toBeTruthy()
                await context.close()
            }
        })

        test("given a project, when user one invites user two as editor, then the invitation is sent", async ({ browser, request }) => {
            const accessToken = await loginViaApi(request, userOne)
            await createProjectViaApi(request, accessToken, projectName)

            const { page } = await getUserOneSession(browser)

            await inviteCollaboratorViaUi(page, userTwo.email, RoleInProject.MEMBER)
        })

        test("given a sent invitation, when the mailbox is checked, then user two received the project invitation email", async ({ request }) => {
            const message = await waitForMessage(request, userTwo.inbox, {
                subject: `You're invited to join ${projectName}`
            })
            expect(message.subject).toContain(projectName)
        })

        test("given a sent invitation, when user one opens the project members, then the invitation is listed as pending", async ({ browser }) => {
            const { page } = await getUserOneSession(browser)
            await openProjectUsers(page)

            const pendingInvites = page.getByTestId("pending-invites")
            await expect(pendingInvites).toBeVisible()

            const invite = page.getByTestId(`pending-invite-${userTwo.email}`)
            await expect(invite).toBeVisible()
            await expect(invite).toContainText(userTwo.email)
            await expect(invite).toContainText(RoleInProject.MEMBER)

            // Finche' l'invito e' in sospeso l'utente 2 non e' ancora un membro.
            await expect(page.getByTestId(`project-member-${userTwo.email}`)).toHaveCount(0)
        })

        test("given an existing account, when user two accepts the invitation, then no new password is asked", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)

            await openInvitationFromEmail(page, request, userTwo, projectName)

            // Account gia' esistente: nessun campo password, solo l'accettazione.
            await expect(page.getByTestId("accept-invitation")).toBeVisible()
            await expect(page.getByTestId("invitation-password")).toHaveCount(0)
            await page.getByTestId("accept-invitation").click()

            await expect(page).not.toHaveURL(/\/project-invitation\//)

            await openProjectUsers(page)
            await expect(page.getByTestId(`project-member-${userTwo.email}`)).toBeVisible()

            await context.close()
        })

        test("given an accepted invitation, when user one opens the project members, then user two is a member and no longer pending", async ({ browser }) => {
            const { page } = await getUserOneSession(browser)
            await openProjectUsers(page)

            await expect(page.getByTestId(`project-member-${userTwo.email}`)).toBeVisible()
            await expect(page.getByTestId(`pending-invite-${userTwo.email}`)).toHaveCount(0)
        })
    })
