import { Alert, AlertDescription, Badge, Switch } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import ProjectPickerList from "@/components/ProjectPickerList"
import useOAuthApi, { OAuthClientWarning, OAuthScope } from "@/hooks/apiClients/useOAuthApi"
import { Project } from "@/hooks/apiClients/useProjectApi"
import useLogout from "@/hooks/useLogout"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import OAuthError from "./OAuthError"
import { clearOAuthResume, saveOAuthResume } from "./oauthResume"

const WARNING_KEYS: Record<OAuthClientWarning, string> = {
    unverified: "oauth.consent.warnings.unverified",
    localhost: "oauth.consent.warnings.localhost",
    custom_scheme: "oauth.consent.warnings.custom_scheme",
    redirect_host_mismatch: "oauth.consent.warnings.redirect_host_mismatch"
}

export const OAuthConsent = () => {
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()
    const handle = searchParams.get("request") ?? ""
    const oauthApi = useOAuthApi()
    const logout = useLogout()
    const notifications = useToastNotificationStore()
    const [projectId, setProjectId] = useState<string>()
    const [allowChanges, setAllowChanges] = useState(false)

    useEffect(() => {
        // If the login detours through "/", the app comes back here from this note.
        saveOAuthResume(`/oauth/consent?request=${handle}`)
    }, [handle])

    const requestQuery = useQuery({
        queryKey: ["oauth-request", handle],
        queryFn: () => oauthApi.getRequest(handle),
        enabled: !!handle,
        retry: false
    })

    const redirect = (redirectTo: string) => {
        clearOAuthResume()
        window.location.assign(redirectTo)
    }

    const approveMutation = useMutation({
        mutationFn: (scopes: OAuthScope[]) => oauthApi.approve(handle, { projectId: projectId ?? "", scopes }),
        onSuccess: data => redirect(data.redirectTo),
        onError: () => notifications.showErrorNotification({ message: t("oauth.consent.approveFailed") })
    })

    const denyMutation = useMutation({
        mutationFn: () => oauthApi.deny(handle),
        onSuccess: data => redirect(data.redirectTo),
        onError: () => notifications.showErrorNotification({ message: t("oauth.consent.denyFailed") })
    })

    const projects = useMemo<Project[]>(
        () => requestQuery.data?.projects.map(p => ({ _id: p.id, name: p.name, description: p.organizationName, slug: "", organizationId: "" })) ?? [],
        [requestQuery.data]
    )

    if (!handle || requestQuery.isError) {
        return <OAuthError code="invalid_request" />
    }

    const data = requestQuery.data
    const selected = data?.projects.find(p => p.id === projectId)
    const writeRequested = data?.scopes.includes("mfe:write") ?? false
    const isViewer = selected?.role?.toUpperCase() === "VIEWER"
    const canAllowChanges = writeRequested && !isViewer
    const busy = approveMutation.isPending || denyMutation.isPending

    const onApprove = () => {
        const scopes: OAuthScope[] = allowChanges && canAllowChanges ? ["mfe:read", "mfe:write"] : ["mfe:read"]
        approveMutation.mutate(scopes)
    }

    return (
        <ApiStatusHandler queries={[requestQuery]}>
            {data && (
                <AuthenticationLayout title={t("oauth.consent.title", { client: data.client.name })} description={t("oauth.consent.description")} size="lg">
                    <div className="flex flex-col gap-4" data-testid="oauth-consent">
                        {data.client.clientIdHost && (
                            <p className="text-center text-sm text-muted-foreground" data-testid="oauth-client-host">
                                {t("oauth.consent.publishedBy", { host: data.client.clientIdHost })}
                            </p>
                        )}
                        <div className="rounded-md border border-border p-4">
                            <p className="text-sm text-muted-foreground">{t("oauth.consent.redirectHost")}</p>
                            <p className="break-all text-lg font-semibold" data-testid="oauth-redirect-host">
                                {data.client.redirectHost}
                            </p>
                            {data.client.warnings.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {data.client.warnings.map(warning => (
                                        <Badge key={warning} variant="destructive">
                                            {t(WARNING_KEYS[warning])}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            {data.client.warnings.includes("redirect_host_mismatch") && (
                                <p className="mt-2 text-sm text-destructive" data-testid="oauth-mismatch-warning">
                                    {t("oauth.consent.redirectHostMismatchDetail", { clientHost: data.client.clientIdHost ?? "", redirectHost: data.client.redirectHost })}
                                </p>
                            )}
                        </div>

                        <div>
                            <p className="mb-2 font-medium">{t("oauth.consent.selectProject")}</p>
                            {projects.length === 0 ? (
                                <Alert variant="destructive">
                                    <AlertDescription>{t("oauth.consent.noProjects")}</AlertDescription>
                                </Alert>
                            ) : (
                                <ProjectPickerList projects={projects} activeProjectId={projectId} onSelect={project => setProjectId(project._id)} />
                            )}
                        </div>

                        <div className="flex items-start justify-between gap-4 rounded-md border border-border p-4">
                            <div>
                                <label htmlFor="oauth-allow-changes" className="font-medium">
                                    {t("oauth.consent.allowChanges")}
                                </label>
                                <p className="text-sm text-muted-foreground">{isViewer ? t("oauth.consent.viewerReadOnly") : t("oauth.consent.allowChangesDescription")}</p>
                            </div>
                            <Switch id="oauth-allow-changes" checked={allowChanges && canAllowChanges} disabled={!canAllowChanges || busy} onCheckedChange={setAllowChanges} />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                            <span>{t("oauth.consent.signedInAs", { email: data.user.email })}</span>
                            <Button variant="link" onClick={() => logout()} disabled={busy}>
                                {t("oauth.consent.signOut")}
                            </Button>
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => denyMutation.mutate()} disabled={busy} dataTestId="oauth-deny">
                                {t("oauth.consent.deny")}
                            </Button>
                            <Button onClick={onApprove} disabled={busy || !projectId} dataTestId="oauth-approve">
                                {t("oauth.consent.approve")}
                            </Button>
                        </div>
                    </div>
                </AuthenticationLayout>
            )}
        </ApiStatusHandler>
    )
}

export default OAuthConsent
