import { Link, useLocation } from 'react-router-dom';

interface NavLinkProps {
  to: string;
  icon: React.ReactNode;
  name: string;
  isSidebarOpen: boolean;
  disabled?: boolean;
}

export const NavLink = ({
  to,
  icon,
  name,
  isSidebarOpen,
  disabled = false,
}: NavLinkProps) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  const baseClasses = 'flex items-center px-4 py-3 mb-1 transition-colors';
  const activeClasses = 'bg-sidebar-accent text-sidebar-accent-foreground';
  const inactiveClasses = 'text-sidebar-foreground hover:bg-sidebar-accent/50';
  const disabledClasses = 'opacity-50 cursor-not-allowed';
  const justifyClass = isSidebarOpen ? 'justify-start' : 'justify-center';

  const linkClasses = `${baseClasses} ${
    isActive ? activeClasses : inactiveClasses
  } ${justifyClass} ${disabled ? disabledClasses : ''}`;

  if (disabled) {
    return (
      <div className={linkClasses}>
        <div className="flex items-center">
          {icon}
          {isSidebarOpen && <span className="ml-3">{name}</span>}
        </div>
      </div>
    );
  }

  return (
    <Link to={to} className={linkClasses}>
      <div className="flex items-center">
        {icon}
        {isSidebarOpen && <span className="ml-3">{name}</span>}
      </div>
    </Link>
  );
};
