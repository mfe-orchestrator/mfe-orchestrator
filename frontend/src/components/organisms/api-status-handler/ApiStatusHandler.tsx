import { Alert, AlertDescription, EmptyState, Spinner } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { IApiStatusHandlerProps } from "./IApiStatusHandlerProps"

/**
 * I default di `emptyComponent` ed `errorComponent` sono elementi JSX, non componenti: senza
 * questi wrapper non ci sarebbe un corpo di componente da cui chiamare l'hook di traduzione.
 */
const DefaultEmptyComponent: React.FC = () => {
    const { t } = useTranslation()

    return <EmptyState size="sm" description={t("common.no_data")} />
}

const DefaultErrorComponent: React.FC<{ error: unknown }> = ({ error }) => {
    const { t } = useTranslation()

    return (
        <Alert variant="destructive">
            <AlertDescription>{error instanceof Error ? error.message : t("app.error.generic")}</AlertDescription>
        </Alert>
    )
}

export const ApiStatusHandler: React.FC<IApiStatusHandlerProps> = ({
    queries,
    children,
    loadingComponent = (
        <div className="flex items-center justify-center min-h-[200px]">
            <Spinner size={32} />
        </div>
    ),
    errorComponent = (error: unknown) => <DefaultErrorComponent error={error} />,
    emptyComponent = <DefaultEmptyComponent />,
    interceptError = true,
    interceptEmpty = true
}) => {
    const isLoading = queries.some(query => (query.isLoading || query.isFetching || query.isPending) && query.isEnabled)
    const error = interceptError ? queries.find(query => query.isError)?.error : undefined
    const isEmpty = interceptEmpty ? queries.some(query => query.data === undefined || query.data === null) : false

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
