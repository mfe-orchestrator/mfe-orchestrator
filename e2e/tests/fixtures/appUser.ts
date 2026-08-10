import { APIRequestContext, Browser, BrowserContext, expect, Page } from "@playwright/test"
import { inboxAddress, isMailProviderReachable, mailProvider, toAppPath, uniqueInbox, waitForEmailLink } from "./emailClient"

export const ISSUER = "microfrontend.orchestrator.hub"

/** Lingua forzata nei test: le asserzioni sui testi usano le traduzioni italiane. */
export const TEST_LANGUAGE = "it"

export const DEFAULT_PASSWORD = "Astr0ngPassword!£%£$"

export enum RoleInProject {
    OWNER = "OWNER",
    MEMBER = "MEMBER",
    VIEWER = "VIEWER"
}

/** Etichette del ruolo nella select di invito (locale `it`). */
export const roleLabels: Record<RoleInProject, string> = {
    [RoleInProject.OWNER]: "Amministratore",
    [RoleInProject.MEMBER]: "Editore",
    [RoleInProject.VIEWER]: "Visualizzatore"
}

export interface TestUser {
    /** Nome della casella, senza dominio: su testmail.app corrisponde al tag. */
    inbox: string
    readonly email: string
    password: string
}

export interface AppSession {
    context: BrowserContext
    page: Page
}

/** Genera un utente di test con casella di posta dedicata. */
export const newTestUser = (prefix: string, password: string = DEFAULT_PASSWORD): TestUser => {
    const inbox = uniqueInbox(prefix)
    return {
        inbox,
        password,
        // Risolto alla prima lettura: gli utenti si dichiarano a livello di describe,
        // e senza le credenziali del provider la discovery dei test deve limitarsi a
        // saltarli invece di fallire in fase di caricamento.
        get email() {
            return inboxAddress(inbox)
        }
    }
}

/**
 * Apre una sessione browser isolata: ogni utente ha il proprio context, cosi'
 * token e progetto selezionato non si sovrappongono tra utente 1 e utente 2.
 */
export async function openApp(browser: Browser): Promise<AppSession> {
    const context = await browser.newContext()
    const page = await context.newPage()
    // i18next legge la lingua da localStorage: senza questo il locale dipende dalla macchina.
    await page.addInitScript(language => {
        localStorage.setItem("i18nextLng", language)
        localStorage.setItem("language", language)
        localStorage.setItem("theme", "LIGHT")
    }, TEST_LANGUAGE)
    return { context, page }
}

/** Verifica che il backend abbia SMTP configurato: senza email non ci sono link da seguire. */
export async function canSendEmail(request: APIRequestContext): Promise<boolean> {
    const response = await request.get("/api/configuration")
    if (!response.ok()) return false
    const config = await response.json()
    return Boolean(config?.canSendEmail)
}

/**
 * Precondizioni dei test che seguono i link ricevuti via email.
 * Restituisce il motivo per cui non sono eseguibili, oppure `null` se tutto e' a posto.
 */
export async function emailDeliveryUnavailable(request: APIRequestContext): Promise<string | null> {
    if (!(await isMailProviderReachable(request))) {
        return `Provider di posta non utilizzabile (${mailProvider.label}). ${mailProvider.setupHint}`
    }
    if (!(await canSendEmail(request))) {
        return "Il backend non ha SMTP configurato (EMAIL_SMTP_HOST): nessuna email da leggere"
    }
    return null
}

/** Registrazione dalla UI, fino alla schermata "controlla la tua email". */
export async function registerViaUi(page: Page, user: TestUser): Promise<void> {
    await page.goto("/register")
    await page.getByTestId("email").fill(user.email)
    await page.getByTestId("password").fill(user.password)
    await page.getByTestId("confirm-password").fill(user.password)
    await page.getByTestId("create-account").click()
    await expect(page.getByTestId("registration-success")).toBeVisible()
}

/**
 * Segue il link di attivazione ricevuto via email.
 *
 * La pagina di attivazione chiama l'API al mount, quindi la `goto` ritorna prima
 * che l'account sia davvero verificato: senza attendere l'esito si prosegue con
 * un utente che il backend rifiuta ancora con "User not verified".
 */
export async function activateAccountFromEmail(page: Page, request: APIRequestContext, user: TestUser): Promise<void> {
    const link = await waitForEmailLink(request, user.inbox, {
        subject: "Activate Your Account",
        linkContains: "/account-activation/"
    })

    const activation = page.waitForResponse(response => response.url().includes("/users/account-activation") && response.request().method() === "POST")
    await page.goto(toAppPath(link))
    const response = await activation
    expect(response.ok(), `Attivazione account fallita per ${user.email} (HTTP ${response.status()}): ${await response.text()}`).toBeTruthy()
}

/**
 * Compila e invia il form di login senza attendere l'esito: serve ai casi in cui
 * il login deve fallire, dove aspettare il token bloccherebbe fino al timeout.
 */
export async function submitLoginForm(page: Page, credentials: { email: string; password: string }): Promise<void> {
    await page.goto("/")
    await page.getByTestId("email").fill(credentials.email)
    await page.getByTestId("password").fill(credentials.password)
    await page.getByTestId("login").click()
}

/** Login dalla UI con email e password, con attesa del token in localStorage. */
export async function loginViaUi(page: Page, user: TestUser): Promise<void> {
    await submitLoginForm(page, user)
    await waitForAuthenticated(page)
}

/** C'e' una sessione attiva nel browser? */
export const isAuthenticated = (page: Page): Promise<boolean> => page.evaluate(() => Boolean(localStorage.getItem("token")))

/**
 * Sessione gia' autenticata, da tenere aperta per piu' test.
 *
 * Rifare login e bootstrap della app a ogni test costa una decina di chiamate
 * ciascuno: su un ambiente condiviso con rate limit per IP la suite arriva a
 * prendersi dei 429 da sola. Nei describe seriali conviene riusare la stessa.
 */
export async function openAppAs(browser: Browser, user: TestUser): Promise<AppSession> {
    const session = await openApp(browser)
    await loginViaUi(session.page, user)
    return session
}

/** Attende che la sessione sia stabilita: senza questo una goto successiva rischia di partire da anonimo. */
export async function waitForAuthenticated(page: Page): Promise<void> {
    await page.waitForFunction(() => Boolean(localStorage.getItem("token")))
}

/** Login via API: usato per preparare lo stato senza passare dalla UI. */
export async function loginViaApi(request: APIRequestContext, user: TestUser): Promise<string> {
    const response = await request.post("/api/users/login", {
        data: { email: user.email, password: user.password }
    })
    expect(response.ok(), `Login API fallito per ${user.email} (HTTP ${response.status()})`).toBeTruthy()
    const { accessToken } = await response.json()
    expect(accessToken, "La risposta di login non contiene accessToken").toBeTruthy()
    return accessToken
}

export interface CreatedProject {
    _id: string
    name: string
}

/**
 * Crea un progetto via API: il wizard di creazione ha gia' i suoi test dedicati,
 * qui serve solo un progetto su cui invitare collaboratori.
 */
export async function createProjectViaApi(request: APIRequestContext, accessToken: string, name: string): Promise<CreatedProject> {
    const response = await request.post("/api/projects", {
        headers: { Authorization: `Bearer ${accessToken}`, issuer: ISSUER },
        data: { name }
    })
    expect(response.ok(), `Creazione progetto fallita (HTTP ${response.status()}): ${await response.text()}`).toBeTruthy()
    return (await response.json()) as CreatedProject
}

/**
 * Apre la pagina membri e aspetta che abbia finito di caricare.
 *
 * La pagina e' un chunk lazy dentro ApiStatusHandler: finche' la query non
 * risolve mostra un loader, e a freddo puo' volerci piu' dei 5s di default di
 * `expect`. Il bottone di invito compare solo a caricamento concluso, quindi fa
 * da segnale di pagina pronta.
 */
export async function openProjectUsers(page: Page): Promise<void> {
    await page.goto("/project-users")
    await expect(page.getByTestId("invite-user")).toBeVisible({ timeout: 30_000 })
}

/** Invita un collaboratore dalla pagina membri del progetto. */
export async function inviteCollaboratorViaUi(page: Page, email: string, role: RoleInProject): Promise<void> {
    await openProjectUsers(page)
    await page.getByTestId("invite-user").click()
    await page.getByTestId("invite-user-email").fill(email)
    await page.getByTestId("invite-user-role").getByRole("combobox").click()
    await page.getByRole("option", { name: roleLabels[role], exact: true }).click()
    await page.getByTestId("send-invitation").click()
}

/** Apre il link di invito ricevuto via email. */
export async function openInvitationFromEmail(page: Page, request: APIRequestContext, user: TestUser, projectName: string): Promise<void> {
    const link = await waitForEmailLink(request, user.inbox, {
        subject: `You're invited to join ${projectName}`,
        linkContains: "/project-invitation/"
    })
    await page.goto(toAppPath(link))
}
