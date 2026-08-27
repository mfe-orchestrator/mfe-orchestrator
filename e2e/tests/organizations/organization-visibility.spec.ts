import { APIRequestContext, expect, test } from "@playwright/test"
import {
    acceptOrganizationInvitationIfPending,
    activateAccountFromEmail,
    createOrganizationViaApi,
    createProjectViaApi,
    emailDeliveryUnavailable,
    getMineProjectsViaApi,
    getOrganizationUsersViaApi,
    inviteToOrganizationViaApi,
    loginViaApi,
    newTestUser,
    openApp,
    RoleInOrganization,
    readProjectViaApi,
    registerViaUi,
    setOrganizationRoleViaApi
} from "../fixtures/appUser"

/**
 * La regola che l'organizzazione introduce: chi la amministra raggiunge tutti i suoi
 * progetti, chi ne e' solo membro solo quelli a cui e' stato invitato.
 *
 * Verificata via API e non dalla UI perche' qui conta cosa il backend concede: la UI
 * mostra quello che riceve, e uno spinning di piu' non prova niente in piu'.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE) e SMTP
 * configurato sul backend, per attivare gli account appena registrati.
 */
test.describe
    .serial("Project visibility inside an organization", () => {
        const owner = newTestUser("orgowner")
        const collaborator = newTestUser("orgmember")
        const suffix = Date.now().toString(36)

        let organizationId: string
        let projectId: string
        let ownerToken: string
        let collaboratorToken: string
        let collaboratorUserId: string

        const projectsOf = async (request: APIRequestContext, token: string) => (await getMineProjectsViaApi(request, token)).map(project => project.name)

        const projectName = `E2E Org visibility ${suffix}`

        test.beforeEach(async ({ request }) => {
            test.setTimeout(300_000)
            const unavailable = await emailDeliveryUnavailable(request)
            test.skip(Boolean(unavailable), unavailable ?? "")
        })

        test("given two brand new accounts, when they are registered, then both can be activated from the email link", async ({ browser, request }) => {
            for (const user of [owner, collaborator]) {
                const { context, page } = await openApp(browser)
                await registerViaUi(page, user)
                await activateAccountFromEmail(page, request, user)
                expect(await loginViaApi(request, user)).toBeTruthy()
                await context.close()
            }
        })

        test("given an owner with an organization, when a project is created in it, then it is theirs", async ({ request }) => {
            ownerToken = await loginViaApi(request, owner)
            organizationId = (await createOrganizationViaApi(request, ownerToken, `E2E Org ${suffix}`))._id
            projectId = (await createProjectViaApi(request, ownerToken, projectName, organizationId))._id

            expect(await projectsOf(request, ownerToken)).toContain(projectName)
        })

        /** Il cuore della regola: appartenere all'organizzazione non da' accesso ai suoi progetti. */
        test("given a plain member of the organization, when they list their projects, then the ones they were not invited to are not there", async ({ request }) => {
            await inviteToOrganizationViaApi(request, ownerToken, organizationId, collaborator.email, RoleInOrganization.MEMBER)
            collaboratorToken = await loginViaApi(request, collaborator)
            await acceptOrganizationInvitationIfPending(request, collaboratorToken, organizationId)

            expect(await projectsOf(request, collaboratorToken)).not.toContain(projectName)

            const response = await readProjectViaApi(request, collaboratorToken, projectId)
            expect(response.ok(), "Un membro dell'organizzazione non deve leggere un progetto a cui non e' stato invitato").toBeFalsy()
        })

        test("given a plain member, when the organization members are listed, then they hold no project of it", async ({ request }) => {
            const members = await getOrganizationUsersViaApi(request, ownerToken, organizationId)
            const member = members.find(candidate => candidate.email === collaborator.email)

            expect(member, "Il collaboratore deve comparire tra i membri dell'organizzazione").toBeTruthy()
            expect(member?.role).toBe(RoleInOrganization.MEMBER)
            expect(member?.projectCount).toBe(0)
            collaboratorUserId = member?._id as string
        })

        /** Chi amministra l'organizzazione la raggiunge tutta: e' quello che evita i progetti orfani. */
        test("given the same user promoted to admin, when they list their projects, then every project of the organization is there", async ({ request }) => {
            await setOrganizationRoleViaApi(request, ownerToken, organizationId, collaboratorUserId, RoleInOrganization.ADMIN)

            expect(await projectsOf(request, collaboratorToken)).toContain(projectName)
            expect((await readProjectViaApi(request, collaboratorToken, projectId)).ok(), "Un amministratore dell'organizzazione deve leggere i suoi progetti").toBeTruthy()
        })

        test("given the admin demoted back to member, when they list their projects, then the project is out of reach again", async ({ request }) => {
            await setOrganizationRoleViaApi(request, ownerToken, organizationId, collaboratorUserId, RoleInOrganization.MEMBER)

            expect(await projectsOf(request, collaboratorToken)).not.toContain(projectName)
            expect((await readProjectViaApi(request, collaboratorToken, projectId)).ok()).toBeFalsy()
        })

        /** Un progetto sta in una sola organizzazione, e la lista si chiede una per volta. */
        test("given two organizations, when the projects of one are asked for, then the other's are not returned", async ({ request }) => {
            const otherOrganizationId = (await createOrganizationViaApi(request, ownerToken, `E2E Org due ${suffix}`))._id
            const otherProjectName = `E2E Progetto altrove ${suffix}`
            await createProjectViaApi(request, ownerToken, otherProjectName, otherOrganizationId)

            const response = await request.get(`/api/organizations/${organizationId}/projects`, {
                headers: { Authorization: `Bearer ${ownerToken}` }
            })
            expect(response.ok(), `Lettura progetti dell'organizzazione fallita (HTTP ${response.status()})`).toBeTruthy()
            const names = ((await response.json()) as Array<{ name: string }>).map(project => project.name)

            expect(names).toContain(projectName)
            expect(names).not.toContain(otherProjectName)
        })

        /** Un membro non amministra: aprire un progetto dentro l'organizzazione non e' cosa sua. */
        test("given a plain member, when they try to create a project in the organization, then it is refused", async ({ request }) => {
            const response = await request.post("/api/projects", {
                headers: { Authorization: `Bearer ${collaboratorToken}` },
                data: { name: `E2E Non consentito ${suffix}`, organizationId }
            })

            expect(response.ok(), "Solo chi amministra l'organizzazione puo' crearci un progetto").toBeFalsy()
        })
    })
