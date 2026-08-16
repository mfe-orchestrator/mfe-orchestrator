import { useTranslation } from "react-i18next"
import SinglePageLayout from "@/components/SinglePageLayout"
import useUserStore from "@/store/useUserStore"
import { AvatarSection, PersonalDataSection } from "./partials"

export const Profile: React.FC = () => {
    const { t } = useTranslation()
    const { user } = useUserStore()

    // L'utente è già stato caricato da AuthWrapper prima di montare le rotte
    // private: qui resta solo da non rompere se lo store fosse vuoto.
    if (!user) return null

    return (
        <SinglePageLayout title={t("profile.title")} description={t("profile.subtitle")}>
            <AvatarSection user={user} />
            <PersonalDataSection user={user} />
        </SinglePageLayout>
    )
}

export default Profile
