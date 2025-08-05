import useThemeStore, { ThemeEnum } from "@/store/useThemeStore";
import { useEffect } from "react";

const themeEnumToClassName = {
    [ThemeEnum.LIGHT]: 'light',
    [ThemeEnum.DARK]: 'dark',
    [ThemeEnum.SYSTEM]: 'system'
} as const;

const ThemeHandler: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { theme } = useThemeStore();

    useEffect(() => {
        const root = window.document.documentElement;
        
        const applyTheme = (theme: ThemeEnum) => {
            // Remove all theme classes first
            root.classList.remove('light', 'dark');
            
            if (theme === ThemeEnum.SYSTEM) {
                const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
                    ? 'dark'
                    : 'light';
                root.classList.add(systemTheme);
            } else {
                root.classList.add(themeEnumToClassName[theme]);
            }
        };

        // Apply the current theme
        applyTheme(theme);

        // Set up system theme change listener
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = () => {
            if (theme === ThemeEnum.SYSTEM) {
                applyTheme(ThemeEnum.SYSTEM);
            }
        };

        // Add event listener for system theme changes
        mediaQuery.addEventListener('change', handleSystemThemeChange);

        // Clean up the event listener on component unmount
        return () => {
            mediaQuery.removeEventListener('change', handleSystemThemeChange);
        };
    }, [theme]);

    return <>{children}</>;
};

export default ThemeHandler;