import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { setLanguageInLocalStorage } from '@/utils/localStorageUtils';
import useUserApi from '@/hooks/apiClients/useUserApi';
import useUserStore from "@/store/useUserStore";

const LanguageSelector = () => {
  const { t, i18n } = useTranslation();
  const userApi = useUserApi();
  const userStore = useUserStore();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setLanguageInLocalStorage(lng);
    if(userStore.user){
      userApi.saveLanguage(lng);
    }
  };

  return (
      <DropdownMenu>
          <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Language selector">
                  <Globe />
                  <span className="sr-only">{t("language.change")}</span>
              </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => changeLanguage("en")}>{t("language.english")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => changeLanguage("it")}>{t("language.italian")}</DropdownMenuItem>
          </DropdownMenuContent>
      </DropdownMenu>
  )
};

export default LanguageSelector;
