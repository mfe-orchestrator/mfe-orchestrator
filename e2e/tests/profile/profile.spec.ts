import { Browser, expect, test } from "@playwright/test"
import {
    AppSession,
    activateAccountFromEmail,
    createProjectViaApi,
    emailDeliveryUnavailable,
    getAvatarViaApi,
    getProfileViaApi,
    loginViaApi,
    newTestUser,
    openApp,
    openAppAs,
    registerViaUi
} from "../fixtures/appUser"

/**
 * Pagina /profile: dati personali e immagine del profilo.
 *
 * La pagina vive dentro MainLayout, quindi serve un progetto attivo: viene
 * creato via API prima di aprire la sessione, altrimenti il wizard di primo
 * avvio copre le rotte e /profile non viene mai renderizzata.
 *
 * Prerequisiti: credenziali testmail.app (TESTMAIL_API_KEY, TESTMAIL_NAMESPACE)
 * e SMTP configurato sul backend, per ricevere il link di attivazione.
 */
test.describe
    .serial("Profile page", () => {
        const user = newTestUser("profile")
        const suffix = Date.now().toString(36)
        const name = "Ada"
        const surname = `Lovelace ${suffix}`

        // PNG 1x1 valido: l'upload deve superare la validazione di formato del
        // backend, che rifiuta qualunque mimetype fuori dalla lista.
        const validPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64")
        // Oltre il limite di 1 MB: qui conta solo la dimensione, il controllo
        // client-side guarda `File.size` e blocca prima di spedire.
        const oversizedPng = Buffer.alloc(1024 * 1024 + 1)

        let session: AppSession | undefined
        let accessToken: string

        const getSession = async (browser: Browser): Promise<AppSession> => {
            session ??= await openAppAs(browser, user)
            return session
        }

        const openProfile = async (browser: Browser) => {
            const { page } = await getSession(browser)
            await page.goto("/profile")
            // La pagina e' un chunk lazy: a freddo i 5s di default non bastano.
            await expect(page.getByTestId("profile-name")).toBeVisible({ timeout: 30_000 })
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

        test("given a new account, when it is registered and activated, then it has neither personal data nor a picture", async ({ browser, request }) => {
            const { context, page } = await openApp(browser)
            await registerViaUi(page, user)
            await activateAccountFromEmail(page, request, user)
            await context.close()

            accessToken = await loginViaApi(request, user)
            await createProjectViaApi(request, accessToken, `E2E Profile ${suffix}`)

            const profile = await getProfileViaApi(request, accessToken)
            expect(profile.email).toBe(user.email)
            expect(profile.name ?? "").toBe("")
            expect(profile.surname ?? "").toBe("")
            expect(await getAvatarViaApi(request, accessToken)).toBeNull()
        })

        test("given a logged in user, when the profile page is opened, then it shows the account email", async ({ browser }) => {
            const page = await openProfile(browser)

            await expect(page.getByTestId("profile-email")).toHaveText(user.email)
            // L'email non e' modificabile: e' testo, non un campo.
            await expect(page.getByTestId("profile-name")).toHaveValue("")
        })

        test("given the personal data form, when name and surname are saved, then the profile keeps them after a reload", async ({ browser, request }) => {
            const page = await openProfile(browser)

            await page.getByTestId("profile-name").fill(name)
            await page.getByTestId("profile-surname").fill(surname)
            await page.getByTestId("profile-save").click()

            await expect.poll(async () => (await getProfileViaApi(request, accessToken)).surname, { timeout: 30_000 }).toBe(surname)
            expect((await getProfileViaApi(request, accessToken)).name).toBe(name)

            await page.reload()
            await expect(page.getByTestId("profile-name")).toHaveValue(name, { timeout: 30_000 })
            await expect(page.getByTestId("profile-surname")).toHaveValue(surname)
        })

        test("given a profile without a picture, when an image is uploaded, then it becomes the profile picture", async ({ browser, request }) => {
            const page = await openProfile(browser)

            await page.getByTestId("profile-avatar-input").setInputFiles({ name: "avatar.png", mimeType: "image/png", buffer: validPng })

            // Il pulsante di rimozione compare solo quando c'e' un'immagine caricata.
            await expect(page.getByTestId("profile-avatar-remove")).toBeVisible({ timeout: 30_000 })
            await expect(page.getByTestId("profile-avatar").locator("img")).toBeVisible()
            expect(await getAvatarViaApi(request, accessToken)).toContain("data:image/png;base64,")
        })

        test("given an image over the size limit, when it is selected, then it is rejected and the picture stays the same", async ({ browser, request }) => {
            const page = await openProfile(browser)
            const before = await getAvatarViaApi(request, accessToken)

            await page.getByTestId("profile-avatar-input").setInputFiles({ name: "huge.png", mimeType: "image/png", buffer: oversizedPng })

            await expect(page.getByText("L'immagine supera la dimensione massima di 1 MB")).toBeVisible({ timeout: 30_000 })
            expect(await getAvatarViaApi(request, accessToken)).toBe(before)
        })

        test("given a profile picture, when it is removed, then the profile goes back to having none", async ({ browser, request }) => {
            const page = await openProfile(browser)

            await page.getByTestId("profile-avatar-remove").click()
            await page.getByRole("button", { name: "Elimina", exact: true }).click()

            await expect(page.getByTestId("profile-avatar-remove")).toHaveCount(0, { timeout: 30_000 })
            expect(await getAvatarViaApi(request, accessToken)).toBeNull()
        })
    })
