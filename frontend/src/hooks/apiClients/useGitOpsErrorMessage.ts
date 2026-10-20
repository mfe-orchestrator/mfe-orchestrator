import { AxiosError } from "axios"
import { useTranslation } from "react-i18next"
import { errorCodeOf } from "../useApiClient"

/** I rifiuti del GitOps arrivano da ogni salvataggio che finisce nel repository: impostazioni, config map, secret, ambienti */
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
    GITOPS_SYNC_FAILED: "settings.gitOps.errors.sync_failed"
}

interface GitOpsErrorDetails {
    repository?: string
    reason?: string
    slug?: string
}

/** Il messaggio del backend e' in inglese per il log: qui si traduce a partire dal codice, undefined per tutto il resto */
export const useGitOpsErrorMessage = () => {
    const { t } = useTranslation()

    return (error: Error): string | undefined => {
        const key = GITOPS_ERROR_KEYS[errorCodeOf(error) ?? ""]
        if (!key) return undefined
        const details: GitOpsErrorDetails = (error as AxiosError<{ error?: { details?: GitOpsErrorDetails } }>)?.response?.data?.error?.details ?? {}
        return t(key, { repository: details.repository, reason: details.reason, slug: details.slug })
    }
}

export default useGitOpsErrorMessage
