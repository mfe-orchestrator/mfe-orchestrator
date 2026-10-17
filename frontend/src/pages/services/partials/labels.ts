import { ServiceRuntime } from "@/hooks/apiClients/useServicesApi"

export const RUNTIME_LABEL_KEYS: Record<ServiceRuntime, string> = {
    [ServiceRuntime.NODE]: "services.runtime.NODE",
    [ServiceRuntime.PYTHON]: "services.runtime.PYTHON",
    [ServiceRuntime.GO]: "services.runtime.GO",
    [ServiceRuntime.DOTNET]: "services.runtime.DOTNET",
    [ServiceRuntime.JAVA]: "services.runtime.JAVA",
    [ServiceRuntime.OTHER]: "services.runtime.OTHER"
}
