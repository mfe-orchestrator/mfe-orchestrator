import { ReactNode } from 'react';
import { UseQueryResult } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

type ApiDataFetcherProps<TData = unknown, TError = unknown> = {
  queries: UseQueryResult<TData, TError>[];
  loadingComponent?: ReactNode;
  errorComponent?: (error: TError) => ReactNode;
  children: ReactNode;
};

export function ApiDataFetcher<TData = unknown, TError = unknown>({
  queries,
  children,
  loadingComponent = (
    <div className="flex items-center justify-center min-h-[200px]">
      <Loader2 className="w-8 h-8 animate-spin" />
    </div>
  ),
  errorComponent = (error: TError) => (
    <div className="p-4 text-red-500">
      Error: {error instanceof Error ? error.message : 'An error occurred'}
    </div>
  ),
}: ApiDataFetcherProps<TData, TError>) {
  const isLoading = queries.some((query) => query.isLoading);
  const error = queries.find((query) => query.isError)?.error;

  if (isLoading) {
    return <>{loadingComponent}</>;
  }

  if (error) {
    return <>{errorComponent(error)}</>;
  }

  return <>{children}</>;
}

export default ApiDataFetcher;