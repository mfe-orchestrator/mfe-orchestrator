import { useQuery } from "@tanstack/react-query"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import type { ServiceUrl } from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"

/** Same rule as the backend (isServiceUrl): absolute http(s), no whitespace, credentials, query nor fragment */
export const isServiceUrl = (value: string): boolean => {
    if (value.length > 2048 || /\s/.test(value)) return false
    try {
        const url = new URL(value)
        return ["http:", "https:"].includes(url.protocol) && !url.search && !url.hash && !url.username && !url.password
    } catch {
        return false
    }
}

/** The base URLs as the settings form holds them: one per environment of the project, in their order */
export const toFormUrls = (urls: ServiceUrl[] | undefined, environments: EnvironmentDTO[]): string[] =>
    environments.map(environment => urls?.find(url => url.environmentId === environment._id)?.url ?? "")

/** Blank ones are left out: the service has no known address in that environment */
export const fromFormUrls = (urls: string[], environments: EnvironmentDTO[]): ServiceUrl[] =>
    environments.flatMap((environment, index) => (urls[index]?.trim() && environment._id ? [{ environmentId: environment._id, url: urls[index].trim() }] : []))

/** The environments of the current project, in their order: the columns of the URLs, the config maps and the secrets */
export const useProjectEnvironmentsQuery = () => {
    const projectId = useProjectStore(state => state.project?._id)
    const projectApi = useProjectApi()

    return useQuery({ queryKey: ["environments", projectId], queryFn: () => projectApi.getEnvironmentsByProjectId(projectId!), enabled: !!projectId })
}
