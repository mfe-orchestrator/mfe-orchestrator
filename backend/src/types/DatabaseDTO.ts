import { DatabaseConnection, DatabaseType } from "../models/DatabaseModel"

/** A credential sent as the placeholder the API answers with keeps the stored one */
export interface DatabaseDTO {
    name: string
    type: DatabaseType
    connection: DatabaseConnection
}
