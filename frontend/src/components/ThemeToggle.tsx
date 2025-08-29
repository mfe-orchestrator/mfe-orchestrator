import { useTranslation } from 'react-i18next';
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore";
import { Button } from "./ui/button";
import { Moon, Sun, Monitor } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import useUserStore from '@/store/useUserStore';
import useUserApi from '@/hooks/apiClients/useUserApi';
import { setThemeInLocalStorage } from '@/utils/localStorageUtils';

const ThemeToggle: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const { user } = useUserStore()
  const userApi = useUserApi();

  const onSetTheme = (theme: ThemeEnum) => {
    setTheme(theme);
    setThemeInLocalStorage(theme);
    if(user){
      userApi.saveTheme(theme)
    }

  }
  

  const getThemeIcon = () => {
      switch (theme) {
          case ThemeEnum.DARK:
              return <Moon />
          case ThemeEnum.LIGHT:
              return <Sun />
          case ThemeEnum.SYSTEM:
          default:
              return <Monitor />
      }
  }

  return (
      <DropdownMenu>
          <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Theme toggle">
                  {getThemeIcon()}
                  <span className="sr-only">{t("theme.toggle_theme")}</span>
              </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onSetTheme(ThemeEnum.LIGHT)}>
                  <Sun className="mr-2 h-4 w-4" />
                  <span>{t("theme.light")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetTheme(ThemeEnum.DARK)}>
                  <Moon className="mr-2 h-4 w-4" />
                  <span>{t("theme.dark")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetTheme(ThemeEnum.SYSTEM)}>
                  <Monitor className="mr-2 h-4 w-4" />
                  <span>{t("theme.system")}</span>
              </DropdownMenuItem>
          </DropdownMenuContent>
      </DropdownMenu>
  )
};

export default ThemeToggle;