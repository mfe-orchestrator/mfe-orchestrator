import { APIRequestContext } from "@playwright/test"

/**
 * Lettura delle email nei test e2e, dietro un'interfaccia unica.
 *
 * - **testmail** (default, in locale e in pipeline): caselle pubbliche su
 *   `inbox.testmail.app`. Funziona con qualsiasi ambiente, anche gia' deployato
 *   (es. console-dev), perche' la posta viaggia davvero su internet: il backend
 *   sotto test deve quindi avere un SMTP reale configurato.
 * - **mailinator**: supportato per retrocompatibilita', richiede un piano a pagamento.
 *
 * Si sceglie con `E2E_MAIL_PROVIDER`.
 */

export type MailProviderName = "testmail" | "mailinator"

export const mailProviderName: MailProviderName = (process.env.E2E_MAIL_PROVIDER as MailProviderName) || "testmail"

export const testmailApiUrl = "https://api.testmail.app/api/json"

export const mailinatorBaseUrl = "https://api.mailinator.com/api/v2"

/**
 * Segmento di path usato dall'API Mailinator: `private` punta al dominio privato
 * dell'account, in alternativa si puo' passare il nome del dominio.
 */
export const mailinatorApiDomain = process.env.MAILINATOR_DOMAIN || "private"

export const mailinatorDomain = process.env.E2E_EMAIL_DOMAIN || "mfeorchestrator.testinator.com"

export interface EmailMessage {
    id: string
    subject: string
}

interface WaitForMessageOptions {
    /** Filtro sull'oggetto: stringa contenuta (case insensitive) o regex. */
    subject?: string | RegExp
    /** Millisecondi di attesa massima prima di fallire. */
    timeout?: number
    /** Intervallo tra due letture della casella. */
    pollInterval?: number
}

interface WaitForLinkOptions extends WaitForMessageOptions {
    /** Sottostringa che il link cercato deve contenere, es. `/project-invitation/`. */
    linkContains?: string
}

const DEFAULT_TIMEOUT = 90_000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface MailProvider {
    /** Nome leggibile, usato nei messaggi di errore. */
    label: string
    /** Cosa fare quando il provider non risulta utilizzabile. */
    setupHint: string
    /** Intervallo di polling: sono API pubbliche a consumo, non vanno martellate. */
    defaultPollInterval: number
    /** Indirizzo completo a cui scrivere per raggiungere questa casella. */
    address(inbox: string): string
    /**
     * Il provider e' configurato e utilizzabile? Un `false` fa saltare i test che
     * leggono le email; se la configurazione c'e' ma e' sbagliata deve invece
     * sollevare un errore, per non nascondere una pipeline rotta.
     */
    isReachable(request: APIRequestContext): Promise<boolean>
    /** Messaggi ricevuti dalla casella. */
    listMessages(request: APIRequestContext, inbox: string): Promise<EmailMessage[]>
    /** Link contenuti in un messaggio. */
    getLinks(request: APIRequestContext, inbox: string, messageId: string): Promise<string[]>
}

const decodeHtmlEntities = (value: string) => value.replaceAll("&amp;", "&").replaceAll("&#x2F;", "/").replaceAll("&#39;", "'").replaceAll("&quot;", '"')

/** Estrae i link da un corpo email, sia dalla parte HTML sia da quella testuale. */
const extractLinks = (html?: string, text?: string): string[] => {
    const links: string[] = []

    for (const match of (html ?? "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
        links.push(decodeHtmlEntities(match[1]))
    }
    for (const match of (text ?? "").matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) {
        links.push(decodeHtmlEntities(match[0]))
    }

    return [...new Set(links.filter(link => link.startsWith("http")))]
}

// #region testmail.app

/**
 * Su testmail.app la casella e' il "tag": qualsiasi indirizzo
 * `<namespace>.<tag>@inbox.testmail.app` viene accettato senza doverlo creare prima.
 */
const testmailNamespace = () => {
    const namespace = process.env.TESTMAIL_NAMESPACE
    if (!namespace) {
        throw new Error("TESTMAIL_NAMESPACE non impostata: serve il namespace dell'account testmail.app.")
    }
    return namespace
}

const testmailApiKey = () => {
    const apiKey = process.env.TESTMAIL_API_KEY
    if (!apiKey) {
        throw new Error("TESTMAIL_API_KEY non impostata: serve la API key dell'account testmail.app.")
    }
    return apiKey
}

interface TestmailEmail {
    id: string
    subject: string
    html?: string
    text?: string
}

/** I corpi arrivano gia' nella lista: si tengono da parte per non richiamare l'API in `getLinks`. */
const testmailBodies = new Map<string, TestmailEmail>()

const fetchTestmail = async (request: APIRequestContext, inbox: string): Promise<TestmailEmail[]> => {
    const params = new URLSearchParams({
        apikey: testmailApiKey(),
        namespace: testmailNamespace(),
        tag: inbox,
        limit: "50"
    })
    const response = await request.get(`${testmailApiUrl}?${params.toString()}`)
    if (!response.ok()) {
        throw new Error(`Lettura della casella ${inbox} da testmail.app fallita (HTTP ${response.status()}): ${await response.text()}`)
    }
    const body = await response.json()
    if (body?.result !== "success") {
        throw new Error(`testmail.app ha rifiutato la richiesta: ${body?.message ?? JSON.stringify(body)}`)
    }
    return (body?.emails ?? []) as TestmailEmail[]
}

const testmailProvider: MailProvider = {
    label: "testmail.app",
    setupHint: "Imposta TESTMAIL_API_KEY e TESTMAIL_NAMESPACE (account testmail.app)",
    // L'API e' pubblica e il piano gratuito e' a consumo: si interroga con calma.
    defaultPollInterval: 3_000,

    address: inbox => `${testmailNamespace()}.${inbox}@inbox.testmail.app`,

    async isReachable(request) {
        // Credenziali assenti: il provider non e' configurato, i test si escludono.
        if (!process.env.TESTMAIL_API_KEY || !process.env.TESTMAIL_NAMESPACE) return false
        // Credenziali presenti ma non valide: meglio un errore che uno skip silenzioso.
        await fetchTestmail(request, "preflight")
        return true
    },

    async listMessages(request, inbox) {
        const emails = await fetchTestmail(request, inbox)
        for (const email of emails) {
            testmailBodies.set(email.id, email)
        }
        return emails.map(email => ({ id: email.id, subject: email.subject }))
    },

    async getLinks(request, inbox, messageId) {
        if (!testmailBodies.has(messageId)) {
            await this.listMessages(request, inbox)
        }
        const email = testmailBodies.get(messageId)
        return extractLinks(email?.html, email?.text)
    }
}

// #endregion

// #region Mailinator

const mailinatorApiKey = () => {
    const apiKey = process.env.MAILINATOR_API_KEY
    if (!apiKey) {
        throw new Error("MAILINATOR_API_KEY non impostata: con E2E_MAIL_PROVIDER=mailinator serve un token valido.")
    }
    return apiKey
}

const mailinatorInboxUrl = (inbox: string) => `${mailinatorBaseUrl}/domains/${mailinatorApiDomain}/inboxes/${encodeURIComponent(inbox)}`

const mailinatorProvider: MailProvider = {
    label: `Mailinator (dominio ${mailinatorDomain})`,
    setupHint: "Imposta MAILINATOR_API_KEY (richiede un piano a pagamento)",
    defaultPollInterval: 3_000,

    address: inbox => `${inbox}@${mailinatorDomain}`,

    async isReachable() {
        return Boolean(process.env.MAILINATOR_API_KEY)
    },

    async listMessages(request, inbox) {
        const response = await request.get(`${mailinatorInboxUrl(inbox)}?token=${mailinatorApiKey()}`)
        if (!response.ok()) {
            throw new Error(`Lettura della casella ${inbox} da Mailinator fallita (HTTP ${response.status()}): ${await response.text()}`)
        }
        const body = await response.json()
        return ((body?.msgs ?? []) as Array<{ id: string; subject: string }>).map(message => ({ id: message.id, subject: message.subject }))
    },

    async getLinks(request, inbox, messageId) {
        const response = await request.get(`${mailinatorInboxUrl(inbox)}/messages/${messageId}/links?token=${mailinatorApiKey()}`)
        if (!response.ok()) {
            throw new Error(`Lettura dei link del messaggio ${messageId} da Mailinator fallita (HTTP ${response.status()}): ${await response.text()}`)
        }
        const body = await response.json()
        return (body?.links ?? []) as string[]
    }
}

// #endregion

const providers: Record<MailProviderName, MailProvider> = {
    testmail: testmailProvider,
    mailinator: mailinatorProvider
}

export const mailProvider: MailProvider = providers[mailProviderName] ?? testmailProvider

/**
 * Casella univoca: ogni test lavora sulla propria, cosi' le email non si mescolano
 * e non serve svuotare nulla tra una run e l'altra.
 */
export const uniqueInbox = (prefix = "e2e"): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** Indirizzo completo della casella, nel formato richiesto dal provider in uso. */
export const inboxAddress = (inbox: string): string => mailProvider.address(inbox)

/** Il provider di posta e' pronto? Usato per escludere i test che leggono le email. */
export const isMailProviderReachable = (request: APIRequestContext): Promise<boolean> => mailProvider.isReachable(request)

const matchesSubject = (message: EmailMessage, subject?: string | RegExp) => {
    if (!subject) return true
    if (subject instanceof RegExp) return subject.test(message.subject ?? "")
    return (message.subject ?? "").toLowerCase().includes(subject.toLowerCase())
}

export const fetchInbox = (request: APIRequestContext, inbox: string): Promise<EmailMessage[]> => mailProvider.listMessages(request, inbox)

export const getMessageLinks = (request: APIRequestContext, inbox: string, messageId: string): Promise<string[]> => mailProvider.getLinks(request, inbox, messageId)

/** Attende che nella casella arrivi un messaggio con l'oggetto richiesto. */
export async function waitForMessage(request: APIRequestContext, inbox: string, options: WaitForMessageOptions = {}): Promise<EmailMessage> {
    const { subject, timeout = DEFAULT_TIMEOUT, pollInterval = mailProvider.defaultPollInterval } = options
    const deadline = Date.now() + timeout
    let lastSeen: string[] = []

    while (Date.now() < deadline) {
        const messages = await fetchInbox(request, inbox)
        lastSeen = messages.map(message => message.subject)
        const match = messages.find(message => matchesSubject(message, subject))
        if (match) return match
        await sleep(pollInterval)
    }

    throw new Error(
        `Nessuna email con oggetto ${subject ?? "(qualsiasi)"} ricevuta su ${inboxAddress(inbox)} entro ${timeout}ms via ${mailProvider.label}. Oggetti presenti: ${JSON.stringify(lastSeen)}`
    )
}

/**
 * Attende l'email richiesta e ne restituisce il primo link utile.
 * Il polling copre sia il ritardo di consegna sia il caso in cui il messaggio
 * corretto arrivi dopo altri gia' presenti in casella.
 */
export async function waitForEmailLink(request: APIRequestContext, inbox: string, options: WaitForLinkOptions = {}): Promise<string> {
    const { subject, linkContains, timeout = DEFAULT_TIMEOUT, pollInterval = mailProvider.defaultPollInterval } = options
    const deadline = Date.now() + timeout
    let lastLinks: string[] = []

    while (Date.now() < deadline) {
        const messages = (await fetchInbox(request, inbox)).filter(message => matchesSubject(message, subject))

        for (const message of messages) {
            const links = await getMessageLinks(request, inbox, message.id)
            lastLinks = links
            const match = linkContains ? links.find(link => link.includes(linkContains)) : links[0]
            if (match) return match
        }

        await sleep(pollInterval)
    }

    throw new Error(
        `Nessun link ${linkContains ?? "(qualsiasi)"} trovato nelle email di ${inboxAddress(inbox)} entro ${timeout}ms via ${mailProvider.label} (oggetto cercato: ${subject ?? "qualsiasi"}). Ultimi link letti: ${JSON.stringify(lastLinks)}`
    )
}

/**
 * Converte un link assoluto ricevuto via email in un path relativo.
 * L'origine nelle email arriva da `FRONTEND_URL` del backend, che non coincide
 * necessariamente con il `baseURL` su cui girano i test.
 */
export function toAppPath(link: string): string {
    try {
        const url = new URL(link)
        return `${url.pathname}${url.search}`
    } catch {
        return link
    }
}
