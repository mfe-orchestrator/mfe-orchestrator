import { useEffect } from "react"
import { useTranslation } from "react-i18next"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import { getLanguageFromLocalStorage, getThemeFromLocalStorage } from "@/utils/localStorageUtils"

const InitialThemeWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    const themeStore = useThemeStore()
    const { i18n } = useTranslation()

    // biome-ignore lint/correctness/useExhaustiveDependencies: This should only run once on mount
    useEffect(() => {
        const theme = getThemeFromLocalStorage()
        const language = getLanguageFromLocalStorage()
        if (theme) {
            themeStore.setTheme(theme as ThemeEnum)
        }
        if (language) {
            themeStore.setLanguage(language)
            i18n.changeLanguage(language)
        }
    }, [])

    return <>{children}</>
}

export default InitialThemeWrapper
