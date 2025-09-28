import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge/badge';
import { Market } from '../../hooks/apiClients/useMarketApi';

interface MarketCardProps {
  market: Market;
  onClick?: (slug: string) => void;
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onClick }) => {
  const { t } = useTranslation();

  const handleCardClick = (e: React.MouseEvent) => {
    if (market.comingSoon || !onClick) {
      e.preventDefault();
      return;
    }
    onClick(market.slug);
  };

  const handleRepoclick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (market.repo) {
      window.open(market.repo, '_blank');
    }
  };

  return (
    <Card
      className={`transition-shadow duration-200 relative ${
        market.comingSoon
          ? 'opacity-60 cursor-not-allowed'
          : onClick
          ? 'cursor-pointer hover:shadow-lg'
          : ''
      }`}
      onClick={handleCardClick}
    >
      {market.comingSoon && (
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="accent" className="bg-orange-100 text-orange-800">
            {t('market.card.comingSoon')}
          </Badge>
        </div>
      )}

      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="text-2xl">
            <img src={market.icon} alt={market.name} className="w-10 h-10" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-lg">{market.name}</CardTitle>
            <div className="text-sm text-gray-500">{market.framework}</div>
          </div>
          {market.repo && !market.comingSoon && (
            <button
              onClick={handleRepoclick}
              className="p-2 rounded-md hover:bg-gray-100 transition-colors"
              title={t('market.card.viewOnGitHub')}
            >
              <svg
                className="w-5 h-5 text-gray-600"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="mb-3">{market.description}</CardDescription>
        {market.tags && market.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {market.tags.map((tag: string, index: number) => (
              <Badge key={index} variant="default" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MarketCard;