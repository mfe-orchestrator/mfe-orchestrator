import { AuthenticationType } from '@/api/apiClient';
import useApiClient from '../useApiClient';

export interface Market {
  _id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  path: string;
}

const useMarketApi = () => {
  const apiClient = useApiClient();

  const getMarkets = async (): Promise<Market[]> => {
    const response = await apiClient.doRequest<Market[]>({
      url: '/api/market',
    });
    return response.data;
  };

  return {
    getMarkets,
  };
};

export default useMarketApi;