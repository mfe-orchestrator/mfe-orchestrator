
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { NavLink } from './NavLink';  
import { 
  Settings, 
  LogOut, 
  User, 
  Menu as MenuIcon, 
  Sun,
  Moon,
  FileText,
  LayoutDashboard,
  Link as LinkIcon,
  Rocket as RocketIcon,
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

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const { user, setUser } = useUserStore();
  const { title, icon, theme } = useThemeStore();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const handleLogout = async () => {
    try {
      // Clear user data from context and local storage
      setUser(null);
      localStorage.removeItem('user');
      // Redirect to login page
      window.location.href = '/login';
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const navItems = [
    {
      name: "Microfrontends",
      path: '/microfrontends',
      icon: <LayoutDashboard className="h-5 w-5" />
    },
    {
      name: t('deployments.title'),
      path: '/deployments',
      icon: <RocketIcon className="h-5 w-5" />
    },
    {
      name: t('integration.title'),
      path: '/integration',
      icon: <LinkIcon className="h-5 w-5" />
    },
    {
      name: t('sftp.title'),
      path: '/sftp',
      disabled: true,
      icon: <FileText className="h-5 w-5" />
    },
    {
      name: t('project_users.title'),
      path: '/project-users',
      icon: <User className="h-5 w-5" />
    },
    {
      name: t('settings.title'),
      path: '/settings',
      disabled: true,
      icon: <Settings className="h-5 w-5" />
    }
  ];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div 
        className={`bg-sidebar fixed h-full transition-all duration-300 ease-in-out border-r border-sidebar-border ${
          isSidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-md bg-orchestrator-accent flex items-center justify-center text-white font-bold">
              {isSidebarOpen ? 'MF' : 'M'}
            </div>
            {isSidebarOpen && (
              <span className="ml-2 text-lg font-semibold text-orchestrator-secondary">
                {t('app.name')}
              </span>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar}
            className="hover:bg-sidebar-accent"
          >
            <MenuIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-8">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              icon={item.icon}
              name={item.name}
              isSidebarOpen={isSidebarOpen}
              disabled={item.disabled}
            />
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Header */}
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
        
        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
