import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge/badge';

interface BlankMarketCardProps {
  onClick: () => void;
}

const BlankMarketCard: React.FC<BlankMarketCardProps> = ({ onClick }) => {
  const { t } = useTranslation();

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-dashed border-2 hover:border-primary"
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="text-2xl">
            <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{t('market.blank.title')}</CardTitle>
            <div className="text-sm text-gray-500">{t('market.blank.framework')}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="mb-3">{t('market.blank.description')}</CardDescription>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-xs">
            {t('market.blank.tag')}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

export default BlankMarketCard;