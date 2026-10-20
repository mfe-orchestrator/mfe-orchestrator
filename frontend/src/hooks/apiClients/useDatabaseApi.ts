import useApiClient from "../useApiClient"

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

const useDatabaseApi = () => {
    const apiClient = useApiClient()

    const getAll = async (): Promise<Database[]> => {
        const response = await apiClient.doRequest<Database[]>({ url: "/api/databases" })
        return response.data
    }

    const getSingle = async (id: string): Promise<Database> => {
        const response = await apiClient.doRequest<Database>({ url: `/api/databases/${id}` })
        return response.data
    }

    const create = async (data: DatabaseDTO): Promise<Database> => {
        const response = await apiClient.doRequest<Database>({ url: "/api/databases", method: "POST", data })
        return response.data
    }

    const update = async (id: string, data: DatabaseDTO): Promise<Database> => {
        const response = await apiClient.doRequest<Database>({ url: `/api/databases/${id}`, method: "PUT", data })
        return response.data
    }

    const deleteSingle = async (id: string): Promise<void> => {
        await apiClient.doRequest({ url: `/api/databases/${id}`, method: "DELETE" })
    }

    return { getAll, getSingle, create, update, deleteSingle }
}

export default useDatabaseApi
