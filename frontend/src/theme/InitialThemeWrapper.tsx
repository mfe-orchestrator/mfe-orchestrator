import { useCallback, useEffect } from "react"
import { useTranslation } from "react-i18next"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import { getLanguageFromLocalStorage, getThemeFromLocalStorage } from "@/utils/localStorageUtils"

const InitialThemeWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    const themeStore = useThemeStore()
    const { i18n } = useTranslation()

    const setThemeEndLanguageFromLocalStorage = useCallback(() => {
        const theme = getThemeFromLocalStorage()
        const language = getLanguageFromLocalStorage()
        if (theme) {
            themeStore.setTheme(theme as ThemeEnum)
        }
        if (language) {
            themeStore.setLanguage(language)
            i18n.changeLanguage(language)
        }
    }, [themeStore, i18n])

    useEffect(() => {
        setThemeEndLanguageFromLocalStorage()
    }, [setThemeEndLanguageFromLocalStorage])

    return <>{children}</>
}

export default InitialThemeWrapper
