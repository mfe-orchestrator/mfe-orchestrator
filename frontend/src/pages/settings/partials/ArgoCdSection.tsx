import { Alert, AlertDescription, AlertTitle, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useArgoCdApi from "@/hooks/apiClients/useArgoCdApi"
import { useGitOpsErrorTranslation } from "@/hooks/apiClients/useGitOpsErrorMessage"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { ArgoCdAccountSetup } from "./ArgoCdAccountSetup"
import { SettingsDetails } from "./SettingsDetails"

/** Stessa normalizzazione del backend: senza slash finale, cosi si capisce se l'URL e' cambiato */
const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, "")

interface ArgoCdSectionProps {
    projectId: string
}

/** Consegna i repository GitOps del progetto ad Argo CD, che gira su un altro cluster e si raggiunge solo dalla sua API */
export const ArgoCdSection: React.FC<ArgoCdSectionProps> = ({ projectId }) => {
    const { t, i18n } = useTranslation()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const argoCdApi = useArgoCdApi()
    const translateError = useGitOpsErrorTranslation()

    const [url, setUrl] = useState("")
    const [token, setToken] = useState("")
    const [repositoryToken, setRepositoryToken] = useState("")

    const argoCdQuery = useQuery({
        queryKey: ["argocd", projectId],
        queryFn: () => argoCdApi.getArgoCd(projectId),
        enabled: !!projectId
    })
    const status = argoCdQuery.data

    // Cambiare progetto lascia la pagina montata: il form segue lo stato del nuovo progetto, i token non restano
    useEffect(() => {
        setUrl(status?.url ?? "")
        setToken("")
        setRepositoryToken("")
    }, [status?.url])

    const initializeMutation = useMutation({
        mutationFn: () =>
            argoCdApi.initializeArgoCd(projectId, {
                url: normalizeUrl(url),
                token: token.trim() || undefined,
                repositoryToken: repositoryToken.trim() || undefined
            }),
        onSuccess: () => {
            setToken("")
            setRepositoryToken("")
            notifications.showSuccessNotification({ message: t("settings.argoCd.initialized") })
        },
        // Anche un fallimento cambia lo stato: il backend salva l'ultimo errore
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["argocd", projectId] })
    })

    // I token salvati vanno solo all'URL con cui sono stati salvati: cambiando URL vanno reinseriti
    const urlChanged = normalizeUrl(url) !== status?.url
    const tokenRequired = !status?.configured || urlChanged
    const repositoryTokenRequired = Boolean(status?.needsRepositoryToken && (!status.repositoryTokenStored || urlChanged))
    const lastError = status?.lastError && (translateError(status.lastError.code, status.lastError.details) ?? status.lastError.message)
    const alignError = status?.alignError && (translateError(status.alignError.code, status.alignError.details) ?? status.alignError.message)
    const canSubmit = !!normalizeUrl(url) && (!tokenRequired || !!token.trim()) && (!repositoryTokenRequired || !!repositoryToken.trim())
    const isPending = initializeMutation.isPending
    // Il backend rifiuta chiunque non sia owner o amministratore: agli altri il form resta in sola lettura
    const disabled = isPending || !status?.canInitialize

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.argoCd.title")}</CardTitle>
                <CardDescription>{t("settings.argoCd.subtitle")}</CardDescription>
            </CardHeader>
            {status && (
                <CardContent className="flex flex-col gap-4 pt-4">
                    <SettingsDetails summary={t("settings.howItWorks")} dataTestId="argocd-details">
                        <p>{t("settings.argoCd.details")}</p>
                    </SettingsDetails>

                    <ArgoCdAccountSetup />

                    <div className="flex flex-col gap-1">
                        <Label htmlFor="argocd-url">{t("settings.argoCd.url")}</Label>
                        <Input id="argocd-url" value={url} placeholder="https://argocd.example.com" disabled={disabled} onChange={event => setUrl(event.target.value)} fullWidth />
                    </div>

                    <div className="flex flex-col gap-1">
                        <Label htmlFor="argocd-token">{t("settings.argoCd.token")}</Label>
                        <Input
                            id="argocd-token"
                            type="password"
                            autoComplete="off"
                            value={token}
                            placeholder={tokenRequired ? undefined : t("settings.argoCd.unchanged")}
                            disabled={disabled}
                            aria-describedby="argocd-token-hint"
                            onChange={event => setToken(event.target.value)}
                            fullWidth
                        />
                        <span id="argocd-token-hint" className="text-xs text-foreground-secondary">
                            {t("settings.argoCd.tokenHint")}
                        </span>
                    </div>

                    {status.needsRepositoryToken && (
                        <div className="flex flex-col gap-1">
                            <Label htmlFor="argocd-repository-token">{t("settings.argoCd.repositoryToken")}</Label>
                            <Input
                                id="argocd-repository-token"
                                type="password"
                                autoComplete="off"
                                value={repositoryToken}
                                placeholder={repositoryTokenRequired ? undefined : t("settings.argoCd.unchanged")}
                                disabled={disabled}
                                aria-describedby="argocd-repository-token-hint"
                                onChange={event => setRepositoryToken(event.target.value)}
                                fullWidth
                            />
                            <div id="argocd-repository-token-hint" className="flex flex-col gap-1 text-xs text-foreground-secondary">
                                <span>{t("settings.argoCd.repositoryTokenHint")}</span>
                                {status.repositoryTokenProviders.map(provider => (
                                    <span key={provider}>{t(`settings.argoCd.repositoryTokenProviderHint.${provider}`)}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {status.initializedAt && (
                        <p className="text-sm text-muted-foreground">
                            {t("settings.argoCd.initializedAt", { date: new Date(status.initializedAt).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" }) })}
                        </p>
                    )}

                    {lastError && (
                        <Alert variant="destructive">
                            <AlertTitle>{t("settings.argoCd.lastErrorTitle")}</AlertTitle>
                            <AlertDescription>{lastError}</AlertDescription>
                        </Alert>
                    )}

                    {alignError && (
                        <Alert variant="destructive">
                            <AlertTitle>{t("settings.argoCd.alignErrorTitle")}</AlertTitle>
                            <AlertDescription>{alignError}</AlertDescription>
                        </Alert>
                    )}

                    <p className="text-sm text-muted-foreground">{t("settings.argoCd.realignHint")}</p>

                    {status.canInitialize ? (
                        <div className="flex justify-end">
                            <Button
                                type="button"
                                disabled={!canSubmit}
                                loading={isPending}
                                loadingLabel={t("common.loading")}
                                dataTestId="argocd-initialize"
                                onClick={() => initializeMutation.mutate()}
                            >
                                {t(status.initializedAt ? "settings.argoCd.realign" : "settings.argoCd.initialize")}
                            </Button>
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t("settings.argoCd.ownerOnly")}</p>
                    )}
                </CardContent>
            )}
        </Card>
    )
}

export default ArgoCdSection
