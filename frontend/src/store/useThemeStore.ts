import { Locale } from "date-fns"
import { de, enUS, es, fr, it } from "date-fns/locale"
import React from "react"
import { create } from "zustand"
import { devtools } from "zustand/middleware"

export enum ThemeEnum {
    LIGHT = "LIGHT",
    DARK = "DARK",
    SYSTEM = "SYSTEM"
}

interface ThemeState {
    icon?: React.ReactNode
    title?: String | React.ReactNode
    setTitle: (title: String | React.ReactNode, icon?: React.ReactNode) => void

    theme: ThemeEnum
    setTheme: (theme: ThemeEnum) => void

    language: string
    setLanguage: (language: string) => void

    getLocale: () => Locale
}

const useThemeStore = create<ThemeState>()(
    devtools(
        (set, get) => ({
            theme: ThemeEnum.SYSTEM,
            language: "en",
            setTitle: (title: String | React.ReactNode, icon?: React.ReactNode) => {
                set({ title, icon })
            },
            setTheme: (theme: ThemeEnum) => {
                set({ theme })
            },
            setLanguage: (language: string) => {
                set({ language })
            },
            getLocale: () => {
                return get().language === "it" ? it : get().language === "fr" ? fr : get().language === "de" ? de : get().language === "es" ? es : enUS
            }
        }),
        {
            name: "theme-storage"
        }
    )
)

export default useThemeStore
