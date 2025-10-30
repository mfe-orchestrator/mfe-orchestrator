import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import React from 'react';
import { Locale } from 'date-fns';
import { it, fr, de, es, enUS } from 'date-fns/locale';

export enum ThemeEnum {
    LIGHT = 'LIGHT',
    DARK = 'DARK',
    SYSTEM = 'SYSTEM'
}

interface ThemeState {
    icon?: React.ReactNode;
    title?: String | React.ReactNode;
    setTitle: (title: String | React.ReactNode, icon?: React.ReactNode) => void;

    theme: ThemeEnum;
    setTheme: (theme: ThemeEnum) => void;

    language: string;
    setLanguage: (language: string) => void;

    getLocale: () => Locale;
}

const useThemeStore = create<ThemeState>()(
  devtools(
    (set, get) => ({
      setTitle: (title: String | React.ReactNode, icon?: React.ReactNode) => {
        set({ title, icon });
      },
      setTheme: (theme: ThemeEnum) => {
        set({ theme });
      },
      setLanguage: (language: string) => {
        set({ language });
      },
      getLocale: () => {
        return get().language === 'it' ? it : get().language === 'fr' ? fr : get().language === 'de' ? de : get().language === 'es' ? es : enUS;
      }
    }),
    {
      name: 'theme-storage',
    }
  )
);

export default useThemeStore