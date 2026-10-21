import { useQuery } from "@tanstack/react-query"
import * as z from "zod"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import type { ServiceUrl } from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"

/** Same rule as the backend (SERVICE_HTTP_PATH): a probe or docs path is absolute, at most 256 characters, without whitespace */
export const SERVICE_HTTP_PATH = /^\/\S{0,255}$/

/** Same rule as the backend: what an HTTPRoute takes as a path, no query, fragment, // nor . or .. segment */
const EXPOSURE_PATH = /^(?!.*%2[fF])(\/|(\/(?!\.{1,2}(\/|$))([-A-Za-z0-9._~!$&'()*+,;=:@]|%[0-9a-fA-F]{2})+)+\/?)$/

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

/**
 * The form fields of what a container declares, with the rules of the backend: shared by a service and by a
 * frontend served by its own container, which declares the same.
 */
export const createServiceRuntimeShape = (messages: { path: string; url: string; exposurePath: string }) => ({
    port: z.string().regex(/^\d{1,5}$/),
    livenessPath: z.string().trim().regex(SERVICE_HTTP_PATH, messages.path),
    readinessPath: z.string().trim().regex(SERVICE_HTTP_PATH, messages.path),
    // Blank: the service publishes no API docs
    docsPath: z
        .string()
        .trim()
        .refine(value => value === "" || SERVICE_HTTP_PATH.test(value), messages.path),
    openApiPath: z
        .string()
        .trim()
        .refine(value => value === "" || SERVICE_HTTP_PATH.test(value), messages.path),
    // Blank: not exposed on the host of the environments
    exposurePath: z
        .string()
        .trim()
        .refine(value => value === "" || (value.length <= 256 && EXPOSURE_PATH.test(value)), messages.exposurePath),
    image: z.object({ repository: z.string().optional() }).optional(),
    // One per environment, in their order; blank: not exposed there
    urls: z.array(
        z
            .string()
            .trim()
            .refine(value => value === "" || isServiceUrl(value), messages.url)
    ),
    env: z.array(
        z.object({
            name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
            required: z.boolean().default(false),
            secret: z.boolean().default(false),
            description: z.string().optional()
        })
    ),
    configMapIds: z.array(z.string()),
    secretIds: z.array(z.string())
})

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
