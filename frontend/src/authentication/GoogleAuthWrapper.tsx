import { Spinner } from "@mfe-orchestrator/design-system"
import { GoogleOAuthProvider } from "@react-oauth/google"
import React, { useMemo, useState } from "react"
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"
import { GoogleProviderConfig } from "@/types/ConfigResponseDTO"

const GoogleAuthWrapper = ({ children }: React.PropsWithChildren) => {
    const parameters = useGlobalParameters()
    const [initialized, setInitialized] = useState<boolean>(false)
    const googleConfig = useMemo(() => {
        const config = parameters.getParameter("providers.google")
        return config as unknown as GoogleProviderConfig | undefined
    }, [parameters])

    if (!googleConfig?.clientId) {
        return <>{children}</>
    }

    return (
        <GoogleOAuthProvider clientId={googleConfig.clientId} onScriptLoadSuccess={() => setInitialized(true)}>
            {initialized ? children : <Spinner />}
        </GoogleOAuthProvider>
    )
}

export default GoogleAuthWrapper
