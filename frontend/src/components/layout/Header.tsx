
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { 
  Settings, 
  LogOut, 
  User, 
  Github
} from 'lucide-react';
import LanguageSelector from '../LanguageSelector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import useUserStore from '@/store/useUserStore';
import useThemeStore from '@/store/useThemeStore';
import ThemeToggle from '../ThemeToggle';
import { useMsal } from '@azure/msal-react';
import { useAuth0 } from '@auth0/auth0-react';
import { deleteToken } from '@/authentication/tokenUtils';

const Header: React.FC = () => {
    const { title, icon } = useThemeStore();
    const { user, clearUser } = useUserStore();
    const { t } = useTranslation();
    const msal = useMsal();
    const auth0 = useAuth0();

    const handleLogout = async () => {
        try {
            // Clear tokens from localStorage
            deleteToken();

            // Logout from Auth0 if logged in with Auth0
            if (auth0.user) {
                auth0.logout();
                return
            }

            const googleData = localStorage.getItem('googleData');            
            if (googleData) {
                localStorage.removeItem('googleData');
                try {
                    const { access_token } = JSON.parse(googleData);
                    if (access_token) {
                        // Revoke the Google access token
                        await fetch('https://oauth2.googleapis.com/revoke?token=' + access_token, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded'
                            }
                        });
                    }
                } catch (error) {
                    console.error('Error revoking Google token:', error);
                }

                return 
            }
            // Logout from Microsoft if logged in with Microsoft
            if (msal?.instance) {
                await msal.instance.logout();
            }
        } catch (error) {
            console.error('Error during logout:', error);
        }finally{
            clearUser();
        }
    };

    return (
        <header className="bg-background border-b border-border h-16 flex items-center justify-between px-6">
    <h1 className="text-xl font-semibold">
      {icon} {title}
    </h1>
    
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <a
          href="https://github.com/Lory1990/micro-frontend-orchestrator-hub"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-md p-2 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="GitHub repository"
        >
          <Github className="h-5 w-5" />
        </a>
        <LanguageSelector />
        <ThemeToggle />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="relative flex items-center gap-2">
            <User className="h-4 w-4" />
            <span>{user?.firstName || user?.email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuLabel>{t('settings.account')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            <span>{t('settings.profile')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            <span>{t('settings.title')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
            <LogOut className="mr-2 h-4 w-4" />
            <span>{t('auth.logout')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
    );
};

export default Header;