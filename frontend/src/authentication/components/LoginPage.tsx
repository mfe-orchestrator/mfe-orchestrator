
import { Link } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button/button"
import useUserApi from "@/hooks/apiClients/useUserApi";
import TextField from "@/components/input/TextField.rhf";
import Spinner from "@/components/Spinner";
import { useMutation } from "@tanstack/react-query";
import { setToken } from "../tokenUtils";
import AuthenticationLayout from "./AuthenticationLayout";
import { FormProvider, useForm } from "react-hook-form";
import SocialLoginRow from "./SocialLoginRow";
import useUserStore from "@/store/useUserStore";
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider";

interface FormValues {
  email: string;
  password: string;
}

export interface LoginComponentProps{
  onSuccessLogin?: () => void;
}

const LoginPage: React.FC<LoginComponentProps> = ({ onSuccessLogin }) => {
  const { login } = useUserApi();
  const { t } = useTranslation();
  const parameters = useGlobalParameters();
  
  const form = useForm<FormValues>();
  const userStore = useUserStore()

  const loginMutation = useMutation({
    mutationFn: login
  })

  const handleLogin = async (values: FormValues) => {
    const loginData = await loginMutation.mutateAsync({
      email: values.email,
      password: values.password
    })
    userStore.setUser(loginData.user)
    setToken(loginData.accessToken, "microfronted.orchestrator.hub")
  };

  const footer = (
      <p className="text-sm text-foreground-secondary">
          {t("auth.no_account")}{" "}
          <Link to="/register" className="text-primary underline underline-offset-4">
              {t("auth.register")}
          </Link>
      </p>
  )

  return (
      <AuthenticationLayout
          title={t("auth.login")}
          description={parameters.getParameter("allowEmbeddedLogin") ? t("auth.login_description") : undefined}
          footer={parameters.getParameter("canRegister") ? footer : undefined}
      >
          {parameters.getParameter("allowEmbeddedLogin") && (
              <FormProvider {...form}>
                  <form onSubmit={form.handleSubmit(handleLogin)}>
                      <div>
                          <TextField
                              name="email"
                              label={t("auth.email")}
                              type="email"
                              autoComplete="email"
                              placeholder={t("auth.email_placeholder")}
                              rules={{ required: t("common.required_field") as string }}
                          />
                          <TextField
                              name="password"
                              label={t("auth.password")}
                              autoComplete="current-password"
                              type="password"
                              placeholder="••••••••"
                              rules={{ required: t("common.required_field") as string }}
                              containerClassName="mt-4"
                          />
                          {parameters.getParameter("canSendEmail") && (
                              <p className="text-sm text-foreground-secondary text-right mt-2">
                                  {t("auth.forgot_password")}{" "}
                                  <Link to="/reset-password-request" className="text-primary underline-offset-4 underline">
                                      {t("auth.recover")}
                                  </Link>
                              </p>
                          )}
                          {loginMutation.isPending ? (
                              <Spinner />
                          ) : (
                              <Button type="submit" className="w-full mt-5" id="access">
                                  {t("auth.login")}
                              </Button>
                          )}
                      </div>
                  </form>
              </FormProvider>
          )}

          <SocialLoginRow onSuccessLogin={onSuccessLogin} />
      </AuthenticationLayout>
  )

};

export default LoginPage;
