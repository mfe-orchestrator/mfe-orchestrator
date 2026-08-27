import { Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { useTranslation } from "react-i18next"
import useUserApi, { User } from "@/hooks/apiClients/useUserApi"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import useUserStore from "@/store/useUserStore"

interface MarketingConsentSectionProps {
    user: User
}

export const MarketingConsentSection: React.FC<MarketingConsentSectionProps> = ({ user }) => {
    const { t } = useTranslation()
    const { updateMarketingConsent } = useUserApi()
    const { setUser } = useUserStore()
    const { getLocale } = useThemeStore()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()

    const consentMutation = useMutation({
        mutationFn: updateMarketingConsent,
        onSuccess: updated => {
            setUser(updated)
            // Come in PersonalDataSection: la cache si riscrive invece di
            // invalidarla, perché la query ["profile"] sta dentro AuthWrapper e il
            // refetch coprirebbe tutta l'applicazione con il loader.
            queryClient.setQueryData(["profile"], updated)
            notifications.showSuccessNotification({
                message: updated.marketingConsent ? t("profile.marketing.notifications.granted") : t("profile.marketing.notifications.withdrawn")
            })
        }
    })

    // Il consenso non ha un pulsante di salvataggio: la casella è già la scelta,
    // e un consenso che resta in un form non salvato non è né prestato né revocato.
    const isGranted = user.marketingConsent === true

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("profile.marketing.title")}</CardTitle>
                <CardDescription>{t("profile.marketing.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <label htmlFor="profile-marketing-consent" className="flex items-start gap-2 text-sm">
                    <Checkbox
                        id="profile-marketing-consent"
                        data-testid="profile-marketing-consent"
                        checked={isGranted}
                        disabled={consentMutation.isPending}
                        onCheckedChange={checked => consentMutation.mutate(checked === true)}
                    />
                    <span>{t("auth.marketing_consent")}</span>
                </label>

                {isGranted && user.marketingConsentAt && (
                    <p className="text-sm text-foreground-secondary mt-2 mb-0" data-testid="profile-marketing-consent-date">
                        {t("profile.marketing.grantedAt", { date: format(new Date(user.marketingConsentAt), "PPP", { locale: getLocale() }) })}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

export default MarketingConsentSection
