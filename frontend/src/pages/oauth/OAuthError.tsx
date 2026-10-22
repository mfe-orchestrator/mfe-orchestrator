import { EmptyState } from "@mfe-orchestrator/design-system"
import { ShieldAlert } from "lucide-react"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import { clearOAuthResume } from "./oauthResume"

const KNOWN_CODES = ["invalid_client", "invalid_redirect_uri", "invalid_request", "server_error"]

export const OAuthError: React.FC<{ code?: string }> = ({ code }) => {
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()
    const raw = code ?? searchParams.get("code") ?? ""
    const known = KNOWN_CODES.includes(raw) ? raw : "server_error"

    useEffect(() => {
        // The flow is over: a stale resume note would drag the next login back to a dead request.
        clearOAuthResume()
    }, [])

    return (
        <AuthenticationLayout title={t("oauth.error.title")} size="default">
            <EmptyState tone="accent" titleAs="h2" icon={<ShieldAlert />} title={t(`oauth.error.codes.${known}.title`)} description={t(`oauth.error.codes.${known}.description`)} />
        </AuthenticationLayout>
    )
}

export default OAuthError
