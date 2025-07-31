
import { useNavigate, useParams } from "react-router-dom";
import useUserApi from "@/hooks/apiClients/useUserApi";
import { useQuery } from "@tanstack/react-query";
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout";
import { useTranslation } from "react-i18next";
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher";
import useToastNotificationStore from "@/store/useToastNotificationStore";

const AccountActivation = () => {
  const { t } = useTranslation();
  const { activateAccount } = useUserApi();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const notifications = useToastNotificationStore()

  const accountActivatonQuery = useQuery({
    queryKey: ['account-activation', token],
    queryFn: async () => {
        await activateAccount(token)
        notifications.showSuccessNotification({
            message: t('auth.account_activation.success')
        })
        navigate("/")
    }
  })

  return (
    <AuthenticationLayout 
      title={t('auth.account_activation.title')}
      description={t('auth.account_activation.description')}
    >
        <ApiDataFetcher queries={[accountActivatonQuery]}>
            <h1>{t('auth.account_activation.success')}</h1>
        </ApiDataFetcher>
    </AuthenticationLayout>
  );
};

export default AccountActivation;
