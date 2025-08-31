import { Card } from '../ui/card';
import { Button } from '../ui/button/button';
import { useTranslation } from 'react-i18next';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: number | string;
  buttonText?: string;
  onAction?: () => void;
  href?: string;
}

const StatCard = ({ 
  icon, 
  title, 
  value, 
  buttonText, 
  onAction, 
  href 
}: StatCardProps) => {
  const { t } = useTranslation();
  const buttonTestReal = buttonText || t('settings.stats.viewAll')
  return (
    <div className="p-3 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border border-gray-100/50 dark:border-gray-700/50">
      <div className="flex items-start justify-between gap-2 h-full">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-primary/10 text-primary text-sm">
            {icon}
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-tight">{title}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        </div>
        <Button 
          variant="ghost"
          size="sm"
          onClick={onAction}
          className="h-auto px-2 py-1 text-xs hover:bg-primary/5"
          asChild={!!href}
        >
          {href ? <Link to={href}>{buttonTestReal}</Link> : buttonTestReal}
        </Button>
      </div>
    </div>
  );
};

interface ProjectStatsSectionProps {
  stats: StatCardProps[]
}

export function ProjectStatsSection({ 
  stats
}: ProjectStatsSectionProps) {
  const { t } = useTranslation();

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">
          {t('settings.stats.title')}
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <StatCard 
            key={index}
            icon={stat.icon}
            title={stat.title}
            value={stat.value}
            buttonText={stat.buttonText}
            onAction={stat.onAction}
            href={stat.href}
          />
        ))}
      </div>
    </Card>
  );
}
