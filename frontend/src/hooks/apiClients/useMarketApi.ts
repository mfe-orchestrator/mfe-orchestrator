import useApiClient from '../useApiClient';

export interface Market {
  _id: string;
  name: string
  slug: string
  comingSoon?: boolean
  description: string
  icon: string
  framework: string
  tags: string[]
  version?: string
  author?: string
  license?: string
  repo?: string
  type?: string
  compiler?: string
  createdAt: Date
  updatedAt: Date
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