import { useTranslation } from "react-i18next"
import SinglePageLayout from "@/components/SinglePageLayout"
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"
import useUserStore from "@/store/useUserStore"
import { AvatarSection, MarketingConsentSection, PersonalDataSection } from "./partials"

export const Profile: React.FC = () => {
    const { t } = useTranslation()
    const { user } = useUserStore()
    const globalParameters = useGlobalParameters()

    // Stessa condizione della casella in fase di registrazione: dove
    // l'installazione non raccoglie il consenso non c'è nulla da cambiare, e
    // l'endpoint rifiuterebbe comunque la modifica.
    const marketingOptInEnabled = globalParameters.getParameter("marketingOptInEnabled") === true

    // L'utente è già stato caricato da AuthWrapper prima di montare le rotte
    // private: qui resta solo da non rompere se lo store fosse vuoto.
    if (!user) return null

    return (
        <SinglePageLayout title={t("profile.title")} description={t("profile.subtitle")}>
            <AvatarSection user={user} />
            <PersonalDataSection user={user} />
            {marketingOptInEnabled && <MarketingConsentSection user={user} />}
        </SinglePageLayout>
    )
}

export default Profile
