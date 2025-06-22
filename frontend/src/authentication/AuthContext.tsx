
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import useUserApi, { User } from "@/hooks/apiClients/useUserApi";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useState } from "react";
import LoginPage from "./components/LoginPage";

type AuthContextType = {
  user: User | null;
  setUser: (user: User) => void;
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
    queryFn: async () =>{
      try{
        const profile = await userApi.getProfile()
        setUser(profile)
        return profile;
      }catch(e){
        console.log(e)
        return null;
      }
    }
  });

  const onSuccessLogin = () => {
    profileQuery.refetch()
  }

  return (
    <ApiDataFetcher queries={[profileQuery]}>
      <AuthContext.Provider
        value={{
          user,
          setUser
        }}
      >
        {user ? <>{children}</> : <LoginPage onSuccessLogin={onSuccessLogin} />}
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
