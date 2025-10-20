
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import useUserApi, { User } from "@/hooks/apiClients/useUserApi";
import { useQuery } from "@tanstack/react-query";
import LoginPage from "../authentication/components/LoginPage";
import useUserStore from "@/store/useUserStore";
import useThemeStore from "@/store/useThemeStore";
import { setLanguageInLocalStorage, setThemeInLocalStorage } from "@/utils/localStorageUtils";
import { useTranslation } from "react-i18next";
import * as Sentry from "@sentry/react";

const AuthWrapper: React.FC<React.PropsWithChildren> = ({ children }) => {

  const userStore = useUserStore()
  const userApi = useUserApi();
  const themeStore = useThemeStore();
  const { i18n } = useTranslation()

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: async () =>{
      try{
        const profile = await userApi.getProfile()
        userStore.setUser(profile);
        if(profile.language){
          themeStore.setLanguage(profile.language);
          setLanguageInLocalStorage(profile.language);
          i18n.changeLanguage(profile.language);
        }
        if(profile.theme){
          themeStore.setTheme(profile.theme);
          setThemeInLocalStorage(profile.theme);
        }

        if(Sentry.isEnabled()){
          Sentry.setUser({
            id: profile.id,
            email: profile.email,
            username: profile.email
          })
        }
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