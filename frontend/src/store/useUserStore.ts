import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { User } from '@/hooks/apiClients/useUserApi';

interface UserState {
  user?: User;
  setUser: (user: User) => void;
}

const useUserStore = create<UserState>()(
  devtools(
    (set, get) => ({
      setUser: (user: User) => {
        set({ user });
      },      
    }),
    {
      name: 'user-storage',
    }
  )
);

export default useUserStore