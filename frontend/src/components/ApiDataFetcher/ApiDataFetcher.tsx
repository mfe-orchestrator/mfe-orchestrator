import { ReactNode } from 'react';
import { UseQueryResult } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

type ApiDataFetcherProps = {
  queries: UseQueryResult<unknown, unknown>[];
  loadingComponent?: ReactNode;
  errorComponent?: (error: unknown) => ReactNode;
  emptyComponent?: ReactNode,
  children: ReactNode;
};

export function ApiDataFetcher({
  queries,
  children,
  loadingComponent = (
    <div className="flex items-center justify-center min-h-[200px]">
      <Loader2 className="w-8 h-8 animate-spin" />
    </div>
  ),
  errorComponent = (error: unknown) => (
    <div className="p-4 text-red-500">
      Error: {error instanceof Error ? error.message : 'An error occurred'}
    </div>
  ),
  emptyComponent = (
    <div className="p-4 text-red-500">
      No data
    </div>
  ),
}: ApiDataFetcherProps) {
  const isLoading = queries.some((query) => (query.isLoading || query.isFetching || query.isPending) && query.isEnabled);
  const error = queries.find((query) => query.isError)?.error;
  const isEmpty = queries.some((query) => !query.data);

  if (isLoading) {
    return <>{loadingComponent}</>;
  }

  if (error) {
    return <>{errorComponent(error)}</>;
  }

  return <>{children}</>;
}

export default ApiDataFetcher;