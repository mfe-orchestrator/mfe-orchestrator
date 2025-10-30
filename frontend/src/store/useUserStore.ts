import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { User } from '@/hooks/apiClients/useUserApi';
import { ThemeEnum } from './useThemeStore';

interface UserState {
  user?: User;
  setUser: (user: User) => void;
  clearUser: () => void;
  setTheme: (theme: ThemeEnum) => void;
  setLanguage: (language: string) => void;
}

const useUserStore = create<UserState>()(
  devtools(
    (set, get) => ({
      setUser: (user: User) => {
        set({ user });
      },
      clearUser: () => {
        set({ user: undefined });
      },  
      setTheme: (theme: ThemeEnum) => {
        set({ user: { ...get().user, theme } });
      },    
      setLanguage: (language: string) => {
        set({ user: { ...get().user, language } });
      },
    }),
    {
      name: 'user-storage',
    }
  )
);

export default useUserStore