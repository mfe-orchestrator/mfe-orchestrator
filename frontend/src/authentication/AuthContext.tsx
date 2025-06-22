
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import useUserApi from "@/hooks/apiClients/useUserApi";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import LoginPage from "./components/LoginPage";

type User = {
  id: string;
  email: string;
  name: string;
};

type AuthContextType = {
  user: User | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const userApi = useUserApi();

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: userApi.getProfile,
  });

  return (
    <ApiDataFetcher queries={[profileQuery]}>
      <AuthContext.Provider
        value={{
          user,
        }}
      >
        {user ? <>{children}</> : <LoginPage />}
      </AuthContext.Provider>
    </ApiDataFetcher>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
