import { useQuery } from "@tanstack/react-query"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useVariableMapsApi, { VariableMapEntry, VariableMapKind } from "@/hooks/apiClients/useVariableMapsApi"
import useProjectStore from "@/store/useProjectStore"

/** Same rule as the backend (SERVICE_VARIABLE_KEY): the key reaches the container as an environment variable name */
export const VARIABLE_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,254}$/

/** Same rule as the backend (VARIABLE_MAP_NAME): a Kubernetes object name */
export const VARIABLE_MAP_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/** Where each kind lives in the console, and the prefix of its translations */
export const VARIABLE_MAP_KINDS: Record<VariableMapKind, { listPath: string; detailPath: (id: string) => string; i18n: string }> = {
    configMap: { listPath: "/config-maps", detailPath: id => `/config-map/${id}`, i18n: "variableMaps.configMap" },
    secret: { listPath: "/secrets", detailPath: id => `/secret/${id}`, i18n: "variableMaps.secret" }
}

/**
 * A key as the form holds it: one value per environment of the project, in their order, so no
 * environment id ends up in a field path. `saved` marks a secret the backend already has: its values
 * are placeholders, which only mean something under the key they were sent with.
 */
export interface VariableEntryFormValue {
    key: string
    values: string[]
    saved: boolean
}

export const toFormEntries = (entries: VariableMapEntry[] | undefined, environments: EnvironmentDTO[], saved: boolean): VariableEntryFormValue[] =>
    (entries ?? []).map(entry => ({
        key: entry.key,
        values: environments.map(environment => entry.values.find(value => value.environmentId === environment._id)?.value ?? ""),
        saved
    }))

/** Blank values are left out: the key stays unset in that environment */
export const fromFormEntries = (entries: VariableEntryFormValue[], environments: EnvironmentDTO[]): VariableMapEntry[] =>
    entries.map(({ key, values }) => ({
        key,
        values: environments.flatMap((environment, index) => (values[index] && environment._id ? [{ environmentId: environment._id, value: values[index] }] : []))
    }))

/** The config maps or the secrets of the current project */
export const useVariableMapsQuery = (kind: VariableMapKind) => {
    const projectId = useProjectStore(state => state.project?._id)
    const { getAll } = useVariableMapsApi(kind)

    return useQuery({ queryKey: ["variable-maps", kind, projectId], queryFn: getAll, enabled: !!projectId })
}
