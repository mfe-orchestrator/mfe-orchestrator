import { AxiosError } from "axios"
import { useTranslation } from "react-i18next"
import { errorCodeOf } from "../useApiClient"

/** I rifiuti del GitOps arrivano dal salvataggio delle impostazioni, dal deploy, che fa il commit sui repository, e dall'inizializzazione di Argo CD */
const GITOPS_ERROR_KEYS: Record<string, string> = {
    GITOPS_SETTINGS_INVALID: "settings.gitOps.errors.settings_invalid",
    GITOPS_REPOSITORY_REQUIRED: "settings.gitOps.errors.repository_required",
    GITOPS_REPOSITORY_INVALID: "settings.gitOps.errors.repository_invalid",
    REPOSITORIES_NOT_AVAILABLE: "settings.gitOps.errors.repositories_not_available",
    GITOPS_OWNER_REQUIRED: "settings.gitOps.errors.owner_required",
    GITOPS_VIEWER_FORBIDDEN: "settings.gitOps.errors.viewer_forbidden",
    GITOPS_COMMIT_FAILED: "settings.gitOps.errors.commit_failed",
    GITOPS_BUSY: "settings.gitOps.errors.busy",
    GITOPS_ENVIRONMENT_SLUG_INVALID: "settings.gitOps.errors.environment_slug_invalid",
    INVALID_REPOSITORY_NAME: "settings.gitOps.errors.invalid_repository_name",
    REPOSITORY_NAME_TAKEN: "settings.gitOps.errors.repository_name_taken",
    ARGOCD_GITOPS_REQUIRED: "settings.argoCd.errors.gitops_required",
    ARGOCD_URL_INVALID: "settings.argoCd.errors.url_invalid",
    ARGOCD_TOKEN_REQUIRED: "settings.argoCd.errors.token_required",
    ARGOCD_REPOSITORY_TOKEN_REQUIRED: "settings.argoCd.errors.repository_token_required",
    ARGOCD_UNREACHABLE: "settings.argoCd.errors.unreachable",
    ARGOCD_TLS_UNTRUSTED: "settings.argoCd.errors.tls_untrusted",
    ARGOCD_UNAUTHORIZED: "settings.argoCd.errors.unauthorized",
    ARGOCD_FORBIDDEN: "settings.argoCd.errors.forbidden",
    ARGOCD_REQUEST_FAILED: "settings.argoCd.errors.request_failed",
    ARGOCD_NAME_CONFLICT: "settings.argoCd.errors.name_conflict",
    ARGOCD_DEPLOY_TOKEN_FAILED: "settings.argoCd.errors.deploy_token_failed",
    ARGOCD_URL_INSECURE: "settings.argoCd.errors.url_insecure",
    ARGOCD_REPOSITORY_CONFLICT: "settings.argoCd.errors.repository_conflict",
    ARGOCD_BUSY: "settings.argoCd.errors.busy",
    ARGOCD_LEASE_LOST: "settings.argoCd.errors.lease_lost"
}

export interface GitOpsErrorDetails {
    repository?: string
    reason?: string
    slug?: string
    url?: string
    name?: string
}

/** Traduce un errore dato per codice e dettagli, come quello che il backend salva sull'ultima inizializzazione di Argo CD */
export const useGitOpsErrorTranslation = () => {
    const { t } = useTranslation()

    return (code?: string, details: GitOpsErrorDetails = {}): string | undefined => {
        const key = GITOPS_ERROR_KEYS[code ?? ""]
        if (!key) return undefined
        return t(key, { repository: details.repository, reason: details.reason, slug: details.slug, url: details.url, name: details.name })
    }
}

/** Il messaggio del backend e' in inglese per il log: qui si traduce a partire dal codice, undefined per tutto il resto */
export const useGitOpsErrorMessage = () => {
    const translate = useGitOpsErrorTranslation()

    return (error: Error): string | undefined => translate(errorCodeOf(error), (error as AxiosError<{ error?: { details?: GitOpsErrorDetails } }>)?.response?.data?.error?.details ?? {})
}

export default useGitOpsErrorMessage
