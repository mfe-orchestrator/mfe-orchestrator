import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import React from 'react';

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
    }),
    {
      name: 'theme-storage',
    }
  )
);

export default useThemeStore