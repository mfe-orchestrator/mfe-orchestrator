import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { User } from '@/hooks/apiClients/useUserApi';

interface UserState {
  user?: User;
  setUser: (user: User) => void;
  clearUser: () => void;
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
    }),
    {
      name: 'user-storage',
    }
  )
);

export default useUserStore