import { useTranslation } from 'react-i18next';
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout";
import { FormProvider, useForm } from "react-hook-form";
import TextField from "@/components/input/TextField.rhf";
import { Button } from "@/components/ui/button/button"
import useStartupApi from "@/hooks/apiClients/useStartupApi";
import useUserApi from "@/hooks/apiClients/useUserApi";
import useUserStore from '@/store/useUserStore';
import GoogleAuthWrapper from '@/authentication/GoogleAuthWrapper';
import Auth0AuthWrapper from '@/authentication/Auth0AuthWrapper';
import MicrosoftAuthWrapper from '@/authentication/MicrosoftAuthWrapper';
import SocialLoginRow from '@/authentication/components/SocialLoginRow';

interface RegisterFirstUserData{
  email: string;
  password: string;
  project: string;
}

const RegisterFirstUser: React.FC = () => {
  const { t } = useTranslation();
  const form = useForm<RegisterFirstUserData>();
  const userApi = useUserApi();
  const startupApi = useStartupApi();
  const userStore = useUserStore()
  const query = useQueryClient()
  
  const onSubmit = async (data: RegisterFirstUserData) => {
    try {
      await startupApi.createFirstUserAndProject(data)
      query.invalidateQueries({ queryKey: ['first-startup-users'] })
    } catch (error) {
      console.log(error)
    }
  };

  const profileQuery = useMutation({
    mutationFn: async () =>{
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

  const onSuccessLogin = async () =>{
    await profileQuery.mutateAsync()
    query.invalidateQueries({ queryKey: ['first-startup-users'] })
  }
  
  return (
    <AuthenticationLayout 
      title={t('setup.title')} 
      description={t('setup.description')}
    >
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-4">
            <TextField 
              name="email" 
              label={t('auth.email')} 
              rules={{ 
                required: t('common.required_field') as string,
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: t('auth.invalid_email') as string
                }
              }} 
              placeholder={t('auth.email_placeholder')}
              autoComplete='email'
            />
            <TextField 
              name="password" 
              label={t('auth.password')} 
              type="password"
              rules={{ 
                required: t('common.required_field') as string,
                minLength: {
                  value: 8,
                  message: t('auth.password_min_length') as string
                }
              }} 
              placeholder="••••••••"
              autoComplete='new-password'
            />
            <TextField 
              name="project" 
              label={t('setup.project_name')} 
              rules={{ 
                required: t('common.required_field') as string,
                minLength: {
                  value: 3,
                  message: t('setup.project_name_min_length') as string
                }
              }}
              placeholder={t('setup.project_name_placeholder')}
            />
            <div className="flex justify-center">
              <Button type="submit">
                {t('common.create')}
              </Button>
            </div>
          </div>
        </form> 
      </FormProvider>
      <GoogleAuthWrapper>
        <Auth0AuthWrapper>
          <MicrosoftAuthWrapper>
            <SocialLoginRow onSuccessLogin={onSuccessLogin} />
          </MicrosoftAuthWrapper>
        </Auth0AuthWrapper>
      </GoogleAuthWrapper>
    </AuthenticationLayout>
  );
}


const FirstStartupWrapper : React.FC<React.PropsWithChildren> = ({children}) =>{

    const startupApi = useStartupApi();

    const usersQuery = useQuery({
      queryKey: ["first-startup-users"],
      queryFn: startupApi.existsAtLeastOneUser
    });

    return <ApiDataFetcher queries={[usersQuery]}>
        {usersQuery.data ? <>{children}</> : <RegisterFirstUser />}
    </ApiDataFetcher>
}

export default FirstStartupWrapper