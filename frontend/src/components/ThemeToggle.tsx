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

const ThemeToggle: React.FC = () => {
  const { t } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  

  const getThemeIcon = () => {
    switch (theme) {
      case ThemeEnum.DARK:
        return <Moon className="h-5 w-5" />;
      case ThemeEnum.LIGHT:
        return <Sun className="h-5 w-5" />;
      case ThemeEnum.SYSTEM:
      default:
        return <Monitor className="h-5 w-5" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          {getThemeIcon()}
          <span className="sr-only">{t('theme.toggle_theme')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme(ThemeEnum.LIGHT)}>
          <Sun className="mr-2 h-4 w-4" />
          <span>{t('theme.light')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(ThemeEnum.DARK)}>
          <Moon className="mr-2 h-4 w-4" />
          <span>{t('theme.dark')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(ThemeEnum.SYSTEM)}>
          <Monitor className="mr-2 h-4 w-4" />
          <span>{t('theme.system')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;