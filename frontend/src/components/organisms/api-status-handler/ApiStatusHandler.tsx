import { Loader2 } from "lucide-react"
import { IApiStatusHandlerProps } from "./IApiStatusHandlerProps"

export const ApiStatusHandler: React.FC<IApiStatusHandlerProps> = ({
    queries,
    children,
    loadingComponent = (
        <div className="flex items-center justify-center min-h-[200px]">
            <Loader2 className="w-8 h-8 animate-spin" />
        </div>
    ),
    errorComponent = (error: unknown) => <div className="p-4 text-red-500 text-center">Error: {error instanceof Error ? error.message : "An error occurred"}</div>,
    emptyComponent = <div className="p-4 text-red-500 text-center">No data</div>,
    interceptError = true,
    interceptEmpty = true
}) => {
    const isLoading = queries.some(query => (query.isLoading || query.isFetching || query.isPending) && query.isEnabled)
    const error = interceptError ? queries.find(query => query.isError)?.error : undefined
    const isEmpty = interceptEmpty ? queries.some(query => !query.data) : false

    if (isLoading) {
        return <>{loadingComponent}</>
    }

    if (error) {
        return <>{errorComponent(error)}</>
    }

    if (isEmpty) {
        return <>{emptyComponent}</>
    }

    return <>{children}</>
}

export default ApiStatusHandler
