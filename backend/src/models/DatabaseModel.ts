import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { encryptedFields } from "../utils/encryptedFieldsPlugin"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"

/** The SQL engines a project can connect */
export enum DatabaseType {
    POSTGRESQL = "POSTGRESQL",
    MYSQL = "MYSQL",
    MARIADB = "MARIADB",
    SQLSERVER = "SQLSERVER",
    ORACLE = "ORACLE"
}

/** Either the address and the account one field at a time, or the whole string the engine's driver takes */
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

/**
 * The keys of a connection that are a credential. A connection string is one as a whole: it usually
 * carries the password. Host, port, database and username stay readable so the list can name the
 * database and the edit form comes back filled in.
 */
export const DATABASE_SECRET_KEYS = ["password", "connectionString"] as const

export const DATABASE_SECRET_PATHS = DATABASE_SECRET_KEYS.map(key => `connection.${key}`)

export interface IDatabase extends Document<ObjectId> {
    projectId: ObjectId
    name: string
    type: DatabaseType
    connection: DatabaseConnection
    createdAt: Date
    updatedAt: Date
    toFrontendObject: () => Record<string, unknown>
}

// The connection is checked by DatabaseService: on an update a validator here would see the ciphertext
const databaseSchema = new Schema<IDatabase>(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        type: {
            type: String,
            enum: Object.values(DatabaseType),
            required: true
        },
        connection: {
            type: Schema.Types.Mixed,
            required: true
        }
    },
    {
        timestamps: true
    }
)

databaseSchema.plugin(encryptedFields, { model: "Database", paths: DATABASE_SECRET_PATHS })

/** The database as the console may see it: the credentials replaced by the placeholder, which submitted back means "keep it" */
databaseSchema.methods.toFrontendObject = function (): Record<string, unknown> {
    const object = this.toObject()
    delete object.__v

    for (const key of DATABASE_SECRET_KEYS) {
        if (object.connection?.[key]) {
            object.connection[key] = SECRET_PLACEHOLDER
        }
    }

    return object
}

const Database = mongoose.model<IDatabase>("Database", databaseSchema)
export default Database
