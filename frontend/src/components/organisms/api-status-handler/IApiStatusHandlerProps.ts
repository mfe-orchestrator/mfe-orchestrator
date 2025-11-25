import { UseQueryResult } from "@tanstack/react-query";
import { ReactNode } from "react";

export interface IApiStatusHandlerProps {
  queries: UseQueryResult<unknown, unknown>[];
  loadingComponent?: ReactNode;
  errorComponent?: (error: unknown) => ReactNode;
  emptyComponent?: ReactNode;
  children: ReactNode;
  interceptError?: boolean;
}
