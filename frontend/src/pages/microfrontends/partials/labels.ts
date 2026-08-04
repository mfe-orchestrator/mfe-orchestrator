import { CanaryDeploymentType, CanaryType, HostedOn } from "@/hooks/apiClients/useMicrofrontendsApi"

/** Translation keys shared by every microfrontend view, so the label of a value is spelled out in one place only. */

export const HOST_TYPE_LABEL_KEYS: Record<HostedOn, string> = {
    [HostedOn.MFE_ORCHESTRATOR_HUB]: "microfrontend.hostTypes.mfeOrchestratorHub",
    [HostedOn.CUSTOM_URL]: "microfrontend.hostTypes.customUrl",
    [HostedOn.CUSTOM_SOURCE]: "microfrontend.hostTypes.customSource"
}

export const CANARY_TYPE_LABEL_KEYS: Record<CanaryType, string> = {
    [CanaryType.ON_SESSIONS]: "microfrontend.sessionType",
    [CanaryType.ON_USER]: "microfrontend.userType",
    [CanaryType.COOKIE_BASED]: "microfrontend.cookieBasedType"
}

export const CANARY_DEPLOYMENT_TYPE_LABEL_KEYS: Record<CanaryDeploymentType, string> = {
    [CanaryDeploymentType.BASED_ON_VERSION]: "microfrontend.deploymentTypes.basedOnVersion",
    [CanaryDeploymentType.BASED_ON_URL]: "microfrontend.deploymentTypes.basedOnUrl"
}
