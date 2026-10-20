import { useTranslation } from "react-i18next"
import type { ConnectionTestResult } from "@/components/ConnectionTest"
import useApiClient, { errorCodeOf } from "../useApiClient"

export enum DatabaseType {
    POSTGRESQL = "POSTGRESQL",
    MYSQL = "MYSQL",
    MARIADB = "MARIADB",
    SQLSERVER = "SQLSERVER",
    ORACLE = "ORACLE"
}

/** The port each engine listens on unless told otherwise */
export const DEFAULT_DATABASE_PORT: Record<DatabaseType, number> = {
    [DatabaseType.POSTGRESQL]: 5432,
    [DatabaseType.MYSQL]: 3306,
    [DatabaseType.MARIADB]: 3306,
    [DatabaseType.SQLSERVER]: 1433,
    [DatabaseType.ORACLE]: 1521
}

/**
 * What the API sends in place of a stored password or connection string; sending it back keeps the stored
 * one. The same string as SECRET_PLACEHOLDER in backend/src/utils/secretCrypto.ts: change both or neither.
 */
export const SECRET_PLACEHOLDER = "••••••••••••"

/** The API sends a placeholder in place of the password and the connection string; sending it back keeps the stored one */
export type DatabaseConnection =
    | {
          authType: "credentials"
          host: string
          port: number
          database: string
          username: string
          password: string
          ssl: boolean
      }
    | {
          authType: "connectionString"
          connectionString: string
      }

export interface Database {
    _id: string
    name: string
    type: DatabaseType
    connection: DatabaseConnection
    createdAt: string
    updatedAt: string
}

export type DatabaseDTO = Pick<Database, "name" | "type" | "connection">

/**
 * A stored password goes only where it already went: changing the engine, or the address it is sent to,
 * means typing it again. The same rule the backend applies before keeping it.
 */
export const keepsStoredSecret = (stored: Pick<Database, "type" | "connection">, current: Pick<DatabaseDTO, "type" | "connection">): boolean => {
    if (stored.type !== current.type || stored.connection.authType !== current.connection?.authType) return false
    if (stored.connection.authType === "connectionString" || current.connection.authType === "connectionString") return true
    // Both are credentials from here on
    return (
        stored.connection.host === current.connection.host?.trim() &&
        stored.connection.port === Number(current.connection.port) &&
        stored.connection.database === current.connection.database?.trim() &&
        stored.connection.username === current.connection.username?.trim()
    )
}

const ERROR_KEYS: Record<string, string> = {
    DATABASE_SECRET_REQUIRED: "database.errors.secret_required",
    DATABASE_WRITE_FORBIDDEN: "database.errors.write_forbidden",
    DATABASE_PORT_INVALID: "database.portInvalid"
}

const useDatabaseErrorMessage = () => {
    const { t } = useTranslation()
    return (error: Error): string | undefined => {
        const key = ERROR_KEYS[errorCodeOf(error) ?? ""]
        return key ? t(key) : undefined
    }
}

const useDatabaseApi = () => {
    const apiClient = useApiClient()
    const customErrorMessage = useDatabaseErrorMessage()

    const getAll = async (): Promise<Database[]> => {
        const response = await apiClient.doRequest<Database[]>({ url: "/api/databases" })
        return response.data
    }

    const getSingle = async (id: string): Promise<Database> => {
        const response = await apiClient.doRequest<Database>({ url: `/api/databases/${id}` })
        return response.data
    }

    const create = async (data: DatabaseDTO): Promise<Database> => {
        const response = await apiClient.doRequest<Database>({ url: "/api/databases", method: "POST", data, customErrorMessage })
        return response.data
    }

    const update = async (id: string, data: DatabaseDTO): Promise<Database> => {
        const response = await apiClient.doRequest<Database>({ url: `/api/databases/${id}`, method: "PUT", data, customErrorMessage })
        return response.data
    }

    const deleteSingle = async (id: string): Promise<void> => {
        await apiClient.doRequest({ url: `/api/databases/${id}`, method: "DELETE", customErrorMessage })
    }

    /** Connects with what the form holds, without saving it; `id` lends the stored credentials on an edit */
    const test = async (data: DatabaseDTO, id?: string): Promise<ConnectionTestResult> => {
        const response = await apiClient.doRequest<ConnectionTestResult>({ url: id ? `/api/databases/${id}/test` : "/api/databases/test", method: "POST", data, customErrorMessage })
        return response.data
    }

    return { getAll, getSingle, create, update, deleteSingle, test }
}

export default useDatabaseApi
