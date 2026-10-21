import useApiClient from "../useApiClient"
import useGitOpsErrorMessage, { GitOpsErrorDetails } from "./useGitOpsErrorMessage"

export type ArgoCdRepositoryKind = "configuration" | "applications"

/** Come Argo CD legge un repository: deploy token creato dalla console (GitLab) o token incollato dall'owner */
export type ArgoCdCredentialSource = "deployToken" | "manual"

export type ArgoCdRepositoryProvider = "GITHUB" | "GITLAB" | "AZURE_DEV_OPS"

/** Lo stato di Argo CD per il progetto: il backend non restituisce mai i token */
export interface ArgoCdStatus {
    url?: string
    /** URL e token salvati: il token si puo omettere alla prossima inizializzazione */
    configured: boolean
    initializedAt?: string
    /** Per codice, da tradurre; il messaggio in inglese per cio che non ha un codice noto */
    lastError?: { code?: string; message: string; details?: GitOpsErrorDetails }
    alignError?: { code?: string; message: string; details?: GitOpsErrorDetails }
    repositories: Partial<Record<ArgoCdRepositoryKind, { source: ArgoCdCredentialSource }>>
    /** Almeno un repository non e' su GitLab: serve un token in sola lettura incollato a mano */
    needsRepositoryToken: boolean
    repositoryTokenProviders: ArgoCdRepositoryProvider[]
    /** Un token dei repository e' gia salvato: si puo omettere */
    repositoryTokenStored: boolean
    /** Owner del progetto o amministratore dell'organizzazione: gli altri vedono lo stato, non inizializzano */
    canInitialize: boolean
}

export interface ArgoCdInitializeDTO {
    url: string
    /** Assente = tiene quello salvato, solo se l'URL non cambia */
    token?: string
    repositoryToken?: string
}

const useArgoCdApi = () => {
    const apiClient = useApiClient()
    const customErrorMessage = useGitOpsErrorMessage()

    const getArgoCd = async (projectId: string): Promise<ArgoCdStatus> => {
        const response = await apiClient.doRequest<ArgoCdStatus>({
            url: `/api/projects/${projectId}/argocd`
        })
        return response.data
    }

    const initializeArgoCd = async (projectId: string, data: ArgoCdInitializeDTO): Promise<ArgoCdStatus> => {
        const response = await apiClient.doRequest<ArgoCdStatus>({
            url: `/api/projects/${projectId}/argocd/initialize`,
            method: "POST",
            data,
            customErrorMessage
        })
        return response.data
    }

    return { getArgoCd, initializeArgoCd }
}

export default useArgoCdApi
