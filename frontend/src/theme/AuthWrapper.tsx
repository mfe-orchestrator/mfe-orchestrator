import * as Sentry from "@sentry/react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { ApiStatusHandler } from "@/components/organisms"
import useUserApi, { User } from "@/hooks/apiClients/useUserApi"
import useThemeStore from "@/store/useThemeStore"
import useUserStore from "@/store/useUserStore"
import { setLanguageInLocalStorage, setThemeInLocalStorage } from "@/utils/localStorageUtils"
import LoginPage from "../authentication/components/LoginPage"

const AuthWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    const userStore = useUserStore()
    const userApi = useUserApi()
    const themeStore = useThemeStore()
    const { i18n } = useTranslation()

    const profileQuery = useQuery({
        queryKey: ["profile"],
        queryFn: async () => {
            try {
                const profile = await userApi.getProfile()
                userStore.setUser(profile)
                if (profile.language) {
                    themeStore.setLanguage(profile.language)
                    setLanguageInLocalStorage(profile.language)
                    i18n.changeLanguage(profile.language)
                }
                if (profile.theme) {
                    themeStore.setTheme(profile.theme)
                    setThemeInLocalStorage(profile.theme)
                }

                if (Sentry.isEnabled()) {
                    Sentry.setUser({
                        id: profile.id,
                        email: profile.email,
                        username: profile.email
                    })
                }
                return profile
            } catch (e) {
                console.log(e)
                return null
            }
        }
    })

    const onSuccessLogin = () => {
        profileQuery.refetch()
    }

    return (
        <ApiStatusHandler queries={[profileQuery]} emptyComponent={<LoginPage onSuccessLogin={onSuccessLogin} />}>
            {children}
        </ApiStatusHandler>
    )
}

export default AuthWrapper
