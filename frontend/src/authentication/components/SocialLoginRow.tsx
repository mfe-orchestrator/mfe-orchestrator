import { useGlobalParameters } from "@/contexts/GlobalParameterProvider";
import LoginWithGoogleButton from "./LoginWithGoogleButton";
import LoginWithAuth0Button from "./LoginWithAuth0Button";
import LoginWithMicrosoftButton from "./LoginWithMicrosoftButton";
import { useTranslation } from "react-i18next";

export interface SocialLoginRowProps{
    onSuccessLogin?: () => void;
}

const SocialLoginRow: React.FC<SocialLoginRowProps> = ({  onSuccessLogin  }) => {
    const { t } = useTranslation();
    const parameters = useGlobalParameters();

    const providersCount = Object.keys(parameters.getParameter("providers") || {}).length;

    if(providersCount === 0){
        return null;
    }

    return <>
        {providersCount > 0 &&
        <>
            <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                {t('auth.or_continue_with')}
                </span>
            </div>
            </div>

            <div className="flex flex-row gap-4">
            {parameters.getParameter("providers.google") &&
                <LoginWithGoogleButton onSuccessLogin={onSuccessLogin} />
            }
            {parameters.getParameter("providers.auth0") &&
                <LoginWithAuth0Button onSuccessLogin={onSuccessLogin} />
            }
            {parameters.getParameter("providers.azure") && (
                <LoginWithMicrosoftButton onSuccessLogin={onSuccessLogin} />
            )}
            </div>
        </>
        }
    </>
}

export default SocialLoginRow