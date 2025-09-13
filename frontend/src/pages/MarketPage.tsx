import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import useMarketApi from '../hooks/apiClients/useMarketApi';
import ApiDataFetcher from '@/components/ApiDataFetcher/ApiDataFetcher';
import SinglePageLayout from '@/components/SinglePageLayout';

const MarketPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getMarkets } = useMarketApi();
  const marketsQuery = useQuery({
    queryKey: ['markets'],
    queryFn: getMarkets,
  });

  const handleCardClick = (marketId: string) => {
    navigate(`/microfrontend?template=${marketId}`);
  };


  return (
    <SinglePageLayout
      title={t('market.title')}
      description={t('market.description')}
    >
      <ApiDataFetcher queries={[marketsQuery]}>
        <div className="container mx-auto px-4 py-8">
          {marketsQuery.data && marketsQuery.data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {marketsQuery.data.map((market) => (
                <Card
                  key={market._id}
                  className="cursor-pointer hover:shadow-lg transition-shadow duration-200"
                  onClick={() => handleCardClick(market._id)}
                >
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{market.icon}</div>
                      <div>
                        <CardTitle className="text-lg">{market.name}</CardTitle>
                        <div className="text-sm text-gray-500">{market.category}</div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{market.description}</CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-gray-500 text-lg mb-2">{t('market.noTemplates.title')}</div>
              <p className="text-gray-400">{t('market.noTemplates.description')}</p>
            </div>
          )}
        </div>
      </ApiDataFetcher>
    </SinglePageLayout>
  );
};

export default MarketPage;