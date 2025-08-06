import useThemeStore, { ThemeEnum } from "@/store/useThemeStore";
import { getLanguageFromLocalStorage, getThemeFromLocalStorage } from "@/utils/localStorageUtils";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";




const InitialThemeWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
    const themeStore = useThemeStore();
    const { i18n } = useTranslation()
    

    const setThemeEndLanguageFromLocalStorage = () => {
        const theme = getThemeFromLocalStorage()
        const language = getLanguageFromLocalStorage()
        if (theme) {
            themeStore.setTheme(theme as ThemeEnum);
        }
        if (language) {
            themeStore.setLanguage(language);
            i18n.changeLanguage(language);
        }
    }

    useEffect(() => {
        setThemeEndLanguageFromLocalStorage();
    }, []);

    return <>{children}</>;
};

export default InitialThemeWrapper;