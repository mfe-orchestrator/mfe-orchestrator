
import { useQuery } from '@tanstack/react-query';
import MarketCard from './MarketCard';
import useMarketApi from '../../hooks/apiClients/useMarketApi';
import ApiDataFetcher from '../ApiDataFetcher/ApiDataFetcher';

interface FetchDataMarketCardProps {
  slug: string;
  onClick?: (slug: string) => void;
}

const FetchDataMarketCard: React.FC<FetchDataMarketCardProps> = ({ slug, onClick }) => {
  const { getMarketBySlug } = useMarketApi();

  const marketQuery = useQuery({
    queryKey: ['market', slug],
    queryFn: () => getMarketBySlug(slug),
    enabled: !!slug, // Only run query if slug is provided
  });

  if(!slug) return <></>


  return  <ApiDataFetcher queries={[marketQuery]}>
    {marketQuery.data ? 
        <MarketCard market={marketQuery.data} onClick={onClick} />
        :
        <></>
    }
  </ApiDataFetcher>
};

export default FetchDataMarketCard;