import { Browser, expect, test } from "@playwright/test"
import {
    AppSession,
    acceptOrganizationInvitationIfPending,
    activateAccountFromEmail,
    createOrganizationViaApi,
    createProjectViaApi,
    emailDeliveryUnavailable,
    getOrganizationUsersViaApi,
    inviteToOrganizationViaApi,
    loginViaApi,
    newTestUser,
    openApp,
    openAppAs,
    organizationRoleLabels,
    RoleInOrganization,
    registerViaUi
} from "../fixtures/appUser"

/**
 * Pagina /organization: chi appartiene all'organizzazione e con quale ruolo.
 *
 * Il progetto viene creato via API prima di aprire la sessione, altrimenti la app mostra
 * il wizard di primo avvio al posto delle rotte e la pagina non viene mai renderizzata.
 *
 * L'invito da UI resta in sospeso solo se il backend ha SMTP: la suite si salta da se'
 * quando non ce l'ha, come gli altri test che dipendono dalla posta.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE) e SMTP
 * configurato sul backend.
 */
test.describe
    .serial("Organization members page", () => {
        const owner = newTestUser("orgmembers")
        const member = newTestUser("orgjoiner")
        const invitee = newTestUser("orginvitee")
        const suffix = Date.now().toString(36)

        let session: AppSession | undefined
        let ownerToken: string
        let organizationId: string

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, owner)
            return session
        }

        /** Apre la pagina membri e aspetta che abbia finito di caricare: e' un chunk lazy dentro ApiStatusHandler. */
        const openOrganizationUsers = async (browser: Browser) => {
            const { page } = await getSession(browser)
            await page.goto("/organization")
            await expect(page.getByTestId(`organization-member-${owner.email}`)).toBeVisible({ timeout: 30_000 })
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

        test("given two brand new accounts, when they are registered, then both can be activated from the email link", async ({ browser, request }) => {
            for (const user of [owner, member]) {
                const { context, page } = await openApp(browser)
                await registerViaUi(page, user)
                await activateAccountFromEmail(page, request, user)
                await context.close()
            }

            ownerToken = await loginViaApi(request, owner)
            organizationId = (await createOrganizationViaApi(request, ownerToken, `E2E Org membri ${suffix}`))._id
            await createProjectViaApi(request, ownerToken, `E2E Progetto membri ${suffix}`, organizationId)
        })

        test("given the organization of the signed-in user, when the members page is opened, then they are listed as its owner", async ({ browser }) => {
            const page = await openOrganizationUsers(browser)

            const row = page.getByTestId(`organization-member-${owner.email}`)
            await expect(row).toContainText(RoleInOrganization.OWNER)
            // Chi amministra raggiunge tutti i progetti, quindi non se ne conta nessuno in particolare.
            await expect(row).toContainText(/tutti i progetti/i)
        })

        test("given a user invited from the page, when the invitation is sent, then it shows up among the pending ones", async ({ browser }) => {
            const page = await openOrganizationUsers(browser)

            await page.getByTestId("invite-organization-user").click()
            await page.getByTestId("invite-organization-user-email").fill(invitee.email)
            await page.getByTestId("invite-organization-user-role").getByRole("combobox").click()
            await page.getByRole("option", { name: organizationRoleLabels[RoleInOrganization.MEMBER], exact: true }).click()
            await page.getByTestId("send-organization-invitation").click()

            await expect(page.getByTestId(`organization-pending-invite-${invitee.email}`)).toBeVisible({ timeout: 30_000 })
        })

        /** Un invito in sospeso non e' un'appartenenza: la pagina lo tiene fuori dai membri. */
        test("given a pending invitation, when the members are counted, then the invited user is not one of them", async ({ browser }) => {
            const page = await openOrganizationUsers(browser)

            await expect(page.getByTestId(`organization-member-${invitee.email}`)).toHaveCount(0)
        })

        test("given a member who accepted, when their role is changed from the page, then the new role is stored", async ({ browser, request }) => {
            await inviteToOrganizationViaApi(request, ownerToken, organizationId, member.email, RoleInOrganization.MEMBER)
            const memberToken = await loginViaApi(request, member)
            await acceptOrganizationInvitationIfPending(request, memberToken, organizationId)

            const page = await openOrganizationUsers(browser)
            await page.reload()
            const roleSelect = page.getByTestId(`organization-role-${member.email}`)
            await expect(roleSelect).toBeVisible({ timeout: 30_000 })

            await roleSelect.selectOption(RoleInOrganization.ADMIN)

            await expect(async () => {
                const members = await getOrganizationUsersViaApi(request, ownerToken, organizationId)
                expect(members.find(candidate => candidate.email === member.email)?.role).toBe(RoleInOrganization.ADMIN)
            }).toPass({ timeout: 30_000 })
        })

        /** L'ultimo proprietario non si tocca: senza di lui l'organizzazione non sarebbe piu' amministrabile. */
        test("given the only owner, when the page is read, then their role cannot be changed", async ({ browser }) => {
            const page = await openOrganizationUsers(browser)

            await expect(page.getByTestId(`organization-role-${owner.email}`)).toHaveCount(0)
        })
    })
