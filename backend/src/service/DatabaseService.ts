import { ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Database, { DatabaseConnection, DatabaseType, IDatabase } from "../models/DatabaseModel"
import { DatabaseDTO } from "../types/DatabaseDTO"
import { toObjectId } from "../utils/mongooseUtils"
import { isEncryptedSecret, SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService from "./BaseAuthorizedService"

const invalid = (code: string, message: string) => createBusinessException({ code, message })

const required = (field: string, value: string): string => {
    if (!value) throw invalid("DATABASE_CONNECTION_INVALID", `${field} is required`)
    return value
}

/**
 * The connection as it is stored: only the fields of its kind, every one filled in. A credential that
 * comes back as the placeholder keeps the stored one; with none to keep it counts as missing, rather
 * than being saved literally. `stored` is undefined on a create.
 */
export const normalizeConnection = (input: unknown, stored?: DatabaseConnection): DatabaseConnection => {
    const connection = (input ?? {}) as Record<string, unknown>
    const text = (key: string) => (typeof connection[key] === "string" ? (connection[key] as string).trim() : "")
    const secret = (key: "password" | "connectionString") => {
        const value = connection[key]
        if (value === SECRET_PLACEHOLDER) return ((stored as Record<string, unknown> | undefined)?.[key] as string | undefined) ?? ""
        // Stored as typed, it would read as a ciphertext and make every load of the database fail to decrypt
        if (isEncryptedSecret(value)) throw invalid("DATABASE_CONNECTION_INVALID", `${key} cannot start with "enc:v1:"`)
        return typeof value === "string" ? value : ""
    }

    if (connection.authType === "connectionString") {
        return { authType: "connectionString", connectionString: required("connectionString", secret("connectionString").trim()) }
    }

    if (connection.authType === "credentials") {
        const port = Number(connection.port)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw invalid("DATABASE_PORT_INVALID", "port must be a number between 1 and 65535")
        }
        return {
            authType: "credentials",
            host: required("host", text("host")),
            port,
            database: required("database", text("database")),
            username: required("username", text("username")),
            password: required("password", secret("password")),
            ssl: connection.ssl === true
        }
    }

    throw invalid("DATABASE_AUTH_TYPE_INVALID", 'authType must be "credentials" or "connectionString"')
}

/** The fields a caller may write, picked by name: anything else in the body never reaches the update */
const toDocument = (dto: DatabaseDTO, stored?: DatabaseConnection) => {
    const name = typeof dto?.name === "string" ? dto.name.trim() : ""
    if (!name) throw invalid("DATABASE_NAME_REQUIRED", "name is required")
    if (!Object.values(DatabaseType).includes(dto.type)) {
        throw invalid("DATABASE_TYPE_INVALID", `type must be one of ${Object.values(DatabaseType).join(", ")}`)
    }
    return { name, type: dto.type, connection: normalizeConnection(dto.connection, stored) }
}

export class DatabaseService extends BaseAuthorizedService {
    async getByProjectId(projectId: string | Schema.Types.ObjectId): Promise<IDatabase[]> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        return Database.find({ projectId: projectIdObj }).sort({ name: 1 })
    }

    async getById(databaseId: string | ObjectId): Promise<IDatabase> {
        const database = await Database.findById(toObjectId(databaseId))
        if (!database) {
            throw new EntityNotFoundError(String(databaseId))
        }
        await this.ensureAccessToProject(database.projectId)
        return database
    }

    async create(projectId: string, dto: DatabaseDTO): Promise<IDatabase> {
        const projectIdObj = toObjectId(projectId)
        await this.ensureAccessToProject(projectIdObj)
        return Database.create({ ...toDocument(dto), projectId: projectIdObj })
    }

    async update(databaseId: string, dto: DatabaseDTO): Promise<IDatabase> {
        const database = await this.getById(databaseId)
        database.set(toDocument(dto, database.connection))
        return database.save()
    }

    async delete(databaseId: string | ObjectId): Promise<void> {
        const database = await this.getById(databaseId)
        await Database.deleteOne({ _id: database._id })
    }
}

export default DatabaseService
