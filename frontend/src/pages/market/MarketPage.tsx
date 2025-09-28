import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input/input';
import { Badge } from '../../components/ui/badge/badge';
import { Select, SelectValue } from '../../components/ui/select/select';
import { SelectTrigger } from '../../components/ui/select/partials/selectTrigger/selectTrigger';
import { SelectContent } from '../../components/ui/select/partials/selectContent/selectContent';
import { SelectItem } from '../../components/ui/select/partials/selectItem/selectItem';
import useMarketApi, { Market } from '../../hooks/apiClients/useMarketApi';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import SinglePageLayout from '@/components/SinglePageLayout';

const MarketCard: React.FC<{ market: Market; onClick: (slug: string) => void }> = ({ market, onClick }) => {
  const { t } = useTranslation();

  const handleCardClick = (e: React.MouseEvent) => {
    if (market.comingSoon) {
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
          : 'cursor-pointer hover:shadow-lg'
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

const BlankMarketCard: React.FC<{ onClick: () => void }> = ({ onClick }) => {
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

const MarketPage : React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getMarkets } = useMarketApi();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFramework, setSelectedFramework] = useState<string>('all');
  const [selectedCompiler, setSelectedCompiler] = useState<string>('all');
  const [hostType, setHostType] = useState<string>('all'); // 'all', 'remote', 'host'

  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: getMarkets,
  });

  const frameworks = useMemo(() => {
    if (!marketsQuery.data) return ['all'];
    const uniqueFrameworks = Array.from(new Set(marketsQuery.data.map(market => market.framework)));
    return ['all', ...uniqueFrameworks];
  }, [marketsQuery.data]);

  const compilers = useMemo(() => {
    if (!marketsQuery.data) return ['all'];
    const uniqueCompilers = Array.from(new Set(marketsQuery.data.map(market => market.compiler).filter(Boolean)));
    return ['all', ...uniqueCompilers];
  }, [marketsQuery.data]);

  const handleCardClick = (marketId: string) => {
    navigate(`/microfrontend/new?template=${marketId}`);
  };

  const handleBlankCardClick = () => {
    navigate('/microfrontend/new');
  };

  const filteredMarkets = useMemo(() => {
    if (!marketsQuery.data) return [];

    return marketsQuery.data.filter((market) => {
      const matchesSearch = market.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFramework = selectedFramework === 'all' || market.framework === selectedFramework;
      const matchesCompiler = selectedCompiler === 'all' || market.compiler === selectedCompiler;
      const matchesHostType = hostType === 'all' ||
        (hostType === 'remote' && market.type === 'remote') ||
        (hostType === 'host' && market.type === 'host');
      return matchesSearch && matchesFramework && matchesCompiler && matchesHostType;
    });
  }, [marketsQuery.data, searchTerm, selectedFramework, selectedCompiler, hostType]);

  const groupedByFramework = useMemo(() => {
    const grouped = filteredMarkets.reduce((acc, market) => {
      if (!acc[market.framework]) {
        acc[market.framework] = [];
      }
      acc[market.framework].push(market);
      return acc;
    }, {} as Record<string, typeof filteredMarkets>);

    return grouped;
  }, [filteredMarkets]);

  const frameworksFetched = Object.keys(groupedByFramework);
  const shouldShowFramework = frameworksFetched.length > 1;




  return (
    <SinglePageLayout
      title={t('market.title')}
      description={t('market.description')}
    >
      <ApiDataFetcher queries={[marketsQuery]}>
        <div>
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1 md:flex-row md:items-center">
              <div className="flex flex-col gap-2 md:flex-row md:gap-3">
                {frameworks.length > 2 && (
                  <Select value={selectedFramework} onValueChange={setSelectedFramework}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('market.filters.selectFramework')} />
                    </SelectTrigger>
                    <SelectContent>
                      {frameworks.map((framework) => (
                        <SelectItem key={framework} value={framework}>
                          {framework === 'all' ? t('market.filters.allFrameworks') : framework}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {compilers.length > 2 && (
                  <Select value={selectedCompiler} onValueChange={setSelectedCompiler}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('market.filters.selectCompiler')} />
                    </SelectTrigger>
                    <SelectContent>
                      {compilers.map((compiler) => (
                        <SelectItem key={compiler} value={compiler}>
                          {compiler === 'all' ? t('market.filters.allCompilers') : compiler}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                  <Select value={hostType} onValueChange={setHostType}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('market.filters.hostType')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('market.filters.allTypes')}</SelectItem>
                      <SelectItem value="remote">{t('market.filters.remote')}</SelectItem>
                      <SelectItem value="host">{t('market.filters.host')}</SelectItem>
                    </SelectContent>
                  </Select>
              </div>
            </div>

            <Input
              placeholder={t('market.filters.searchPlaceholder')}
              name="search"
              value={searchTerm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>

          {filteredMarkets.length > 0 || (!searchTerm && selectedFramework === 'all' && selectedCompiler === 'all' && hostType === 'all') ? (
            shouldShowFramework ? (
              <div className="space-y-8">
                {/* Show blank card in first framework group if no filters */}
                {!searchTerm && selectedFramework === 'all' && selectedCompiler === 'all' && hostType === 'all' && frameworksFetched.length > 0 && (
                  <div key="blank-section">
                    <h3 className="text-xl font-semibold mb-4 capitalize">{frameworksFetched[0]}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <BlankMarketCard onClick={handleBlankCardClick} />
                      {groupedByFramework[frameworksFetched[0]].map((market) => (
                        <MarketCard key={market._id} market={market} onClick={handleCardClick} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Show remaining framework groups */}
                {frameworksFetched.slice((!searchTerm && selectedFramework === 'all' && selectedCompiler === 'all' && hostType === 'all') ? 1 : 0).map((singleFramework) => (
                  <div key={singleFramework}>
                    <h3 className="text-xl font-semibold mb-4 capitalize">{singleFramework}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {groupedByFramework[singleFramework].map((market) => (
                        <MarketCard key={market._id} market={market} onClick={handleCardClick} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Show blank card as first item if no filters */}
                {!searchTerm && selectedFramework === 'all' && selectedCompiler === 'all' && hostType === 'all' && (
                  <BlankMarketCard onClick={handleBlankCardClick} />
                )}
                {filteredMarkets.map((market) => (
                  <MarketCard key={market._id} market={market} onClick={handleCardClick} />
                ))}
              </div>
            )
          ) : (
            <div>
              {/* Show blank card even when no templates available, if no filters are active */}
              {!searchTerm && selectedFramework === 'all' && selectedCompiler === 'all' && hostType === 'all' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  <BlankMarketCard onClick={handleBlankCardClick} />
                </div>
              ) : null}

              <div className="text-center py-12">
                <div className="text-gray-500 text-lg mb-2">
                  {searchTerm || selectedFramework !== 'all' || selectedCompiler !== 'all' || hostType !== 'all'
                    ? t('market.noResults.title')
                    : t('market.noTemplates.title')
                  }
                </div>
                <p className="text-gray-400">
                  {searchTerm || selectedFramework !== 'all' || selectedCompiler !== 'all' || hostType !== 'all'
                    ? t('market.noResults.description')
                    : t('market.noTemplates.description')
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </ApiDataFetcher>
    </SinglePageLayout>
  );
};

export default MarketPage;