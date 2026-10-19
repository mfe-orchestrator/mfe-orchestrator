/** A config map holds values anyone who sees the project may read; a secret holds values never sent back once written */
export type VariableMapKind = "configMap" | "secret"

/** What a map is called: a Kubernetes object name (DNS label), so it can become one as it is */
export const VARIABLE_MAP_NAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/** A key with its value per environment; a blank value leaves it unset there */
export interface VariableMapEntryDTO {
    key: string
    values?: Array<{ environmentId: string; value?: string }>
}

interface VariableMapDTO {
    id?: string
    name: string
    description?: string
    /** For a secret, a value sent as the placeholder the API answers with keeps the stored one */
    entries?: VariableMapEntryDTO[]
    createdAt?: Date
    updatedAt?: Date
}

export default VariableMapDTO
