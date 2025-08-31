import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Button } from "@/components/ui/button/button"
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
  HardDrive,
  Github,
  Key as KeyIcon
} from 'lucide-react';
import LanguageSelector from '../../components/LanguageSelector';
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
import ThemeToggle from '../../components/ThemeToggle';
import Header from './Header';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
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
      name: t('settings.title'),
      path: '/settings',
      icon: <Settings className="h-5 w-5" />
    },
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
        <Header />
        {/* Page Content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
