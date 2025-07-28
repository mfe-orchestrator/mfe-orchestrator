
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import useUserApi, { User } from "@/hooks/apiClients/useUserApi";
import { useQuery } from "@tanstack/react-query";
import LoginPage from "../authentication/components/LoginPage";
import useUserStore from "@/store/userStore";

const AuthWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {

  const userStore = useUserStore()
  const userApi = useUserApi();

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () =>{
      try{
        const profile = await userApi.getProfile()
        userStore.setUser(profile)
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
        {userStore.user ? <>{children}</> : <LoginPage onSuccessLogin={onSuccessLogin} />}
    </ApiDataFetcher>
  );
};

export default AuthWrapper