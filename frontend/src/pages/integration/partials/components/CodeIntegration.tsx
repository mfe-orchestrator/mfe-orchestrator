import useServeApi from "@/hooks/apiClients/useServeApi"
import { useQuery } from "@tanstack/react-query"
import ApiDataFetcher from "../../../../components/ApiDataFetcher/ApiDataFetcher"

export interface CodeIntegrationProps {
    framework: "vite" | "webpack",
    microfrontendId: string
    deploymentId: string
}

export const CodeIntegration: React.FC<CodeIntegrationProps> = ({ framework, microfrontendId, deploymentId }) => {

    const serveApi = useServeApi()

    const codeQuery = useQuery({
        queryKey: ["code", framework, microfrontendId, deploymentId],
        queryFn: () => serveApi.getCodeIntegration({ framework, microfrontendId, deploymentId })
    })

    return (
        <ApiDataFetcher queries={[codeQuery]}>
            {codeQuery.data?.code && <code>{codeQuery.data.code}</code>}
        </ApiDataFetcher>
    )
}

export default CodeIntegration
