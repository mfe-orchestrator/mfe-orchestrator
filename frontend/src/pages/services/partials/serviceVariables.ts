import { useQuery } from "@tanstack/react-query"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import type { ServiceVariable } from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"

/** Same rule as the backend (SERVICE_VARIABLE_KEY): the key reaches the container as an environment variable name */
export const SERVICE_VARIABLE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/

export type ServiceVariablesKind = "configMap" | "secrets"

/**
 * A key as the settings form holds it: one value per environment of the project, in their order, so
 * no environment id ends up in a field path. `saved` marks a secret the backend already has: its values
 * are placeholders, which only mean something under the key they were sent with.
 */
export interface ServiceVariableFormValue {
    key: string
    values: string[]
    saved: boolean
}

export const toFormVariables = (variables: ServiceVariable[] | undefined, environments: EnvironmentDTO[], saved: boolean): ServiceVariableFormValue[] =>
    (variables ?? []).map(variable => ({
        key: variable.key,
        values: environments.map(environment => variable.values.find(value => value.environmentId === environment._id)?.value ?? ""),
        saved
    }))

/** Blank values are left out: the key stays unset in that environment */
export const fromFormVariables = (variables: ServiceVariableFormValue[], environments: EnvironmentDTO[]): ServiceVariable[] =>
    variables.map(({ key, values }) => ({
        key,
        values: environments.flatMap((environment, index) => (values[index] && environment._id ? [{ environmentId: environment._id, value: values[index] }] : []))
    }))

/** The environments of the current project, in their order: the columns of the config map and of the secrets */
export const useProjectEnvironmentsQuery = () => {
    const projectId = useProjectStore(state => state.project?._id)
    const projectApi = useProjectApi()

    return useQuery({ queryKey: ["environments", projectId], queryFn: () => projectApi.getEnvironmentsByProjectId(projectId!), enabled: !!projectId })
}
