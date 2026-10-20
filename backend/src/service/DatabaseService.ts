import { ObjectId, Schema } from "mongoose"
import { testDatabaseConnection } from "../client/SqlDatabaseClient"
import { createBusinessException } from "../errors/BusinessException"
import { EntityNotFoundError } from "../errors/EntityNotFoundError"
import Database, { DatabaseConnection, DatabaseType, IDatabase } from "../models/DatabaseModel"
import { DatabaseDTO } from "../types/DatabaseDTO"
import { ConnectionTestResultDTO, runConnectionTest } from "../utils/connectionTest"
import { toObjectId } from "../utils/mongooseUtils"
import { isEncryptedSecret, SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import BaseAuthorizedService from "./BaseAuthorizedService"

const WRITE_FORBIDDEN = { code: "DATABASE_WRITE_FORBIDDEN", message: "A viewer of the project cannot connect, edit, test or delete a database" }

const invalid = (code: string, message: string) => createBusinessException({ code, message })

const required = (field: string, value: string): string => {
    if (!value) throw invalid("DATABASE_CONNECTION_INVALID", `${field} is required`)
    return value
}

/**
 * The connection as it is stored: only the fields of its kind, every one filled in. A credential that
 * comes back as the placeholder keeps the stored one, but only where it already went: with another
 * address it has to be typed again, or whoever may edit the database could send it to a host of their
 * own. `stored` is undefined on a create and when the engine changes.
 */
export const normalizeConnection = (input: unknown, stored?: DatabaseConnection): DatabaseConnection => {
    const connection = (input ?? {}) as Record<string, unknown>
    const text = (key: string) => (typeof connection[key] === "string" ? (connection[key] as string).trim() : "")
    const secret = (key: "password" | "connectionString", kept: string | undefined) => {
        const value = connection[key]
        if (value === SECRET_PLACEHOLDER) {
            if (!kept) throw invalid("DATABASE_SECRET_REQUIRED", `Type the ${key} again: a stored one is kept only while the engine and the address stay the same`)
            return kept
        }
        // Stored as typed, it would read as a ciphertext and make every load of the database fail to decrypt
        if (isEncryptedSecret(value)) throw invalid("DATABASE_CONNECTION_INVALID", `${key} cannot start with "enc:v1:"`)
        return typeof value === "string" ? value : ""
    }

    if (connection.authType === "connectionString") {
        const kept = stored?.authType === "connectionString" ? stored.connectionString : undefined
        return { authType: "connectionString", connectionString: required("connectionString", secret("connectionString", kept).trim()) }
    }

    if (connection.authType === "credentials") {
        const port = Number(connection.port)
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw invalid("DATABASE_PORT_INVALID", "port must be a number between 1 and 65535")
        }
        const host = required("host", text("host"))
        const database = required("database", text("database"))
        const username = required("username", text("username"))
        const kept = stored?.authType === "credentials" && stored.host === host && stored.port === port && stored.database === database && stored.username === username ? stored.password : undefined
        return { authType: "credentials", host, port, database, username, password: required("password", secret("password", kept)), ssl: connection.ssl === true }
    }

    throw invalid("DATABASE_AUTH_TYPE_INVALID", 'authType must be "credentials" or "connectionString"')
}

/** The engine and the connection, picked by name: anything else in the body never reaches the database */
export const toConnection = (dto: Partial<DatabaseDTO> | undefined, stored?: IDatabase): { type: DatabaseType; connection: DatabaseConnection } => {
    const type = dto?.type
    if (!type || !Object.values(DatabaseType).includes(type)) {
        throw invalid("DATABASE_TYPE_INVALID", `type must be one of ${Object.values(DatabaseType).join(", ")}`)
    }
    return { type, connection: normalizeConnection(dto.connection, stored?.type === type ? stored.connection : undefined) }
}

const toDocument = (dto: DatabaseDTO, stored?: IDatabase) => {
    const name = typeof dto?.name === "string" ? dto.name.trim() : ""
    if (!name) throw invalid("DATABASE_NAME_REQUIRED", "name is required")
    return { name, ...toConnection(dto, stored) }
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
        await this.ensureNotViewer(projectIdObj, WRITE_FORBIDDEN)
        // The databases are shared by the whole project, not owned by one of its domains
        await this.ensureWholeProject(projectIdObj)
        return Database.create({ ...toDocument(dto), projectId: projectIdObj })
    }

    async update(databaseId: string, dto: DatabaseDTO): Promise<IDatabase> {
        const database = await this.getById(databaseId)
        await this.ensureNotViewer(database.projectId, WRITE_FORBIDDEN)
        await this.ensureWholeProject(database.projectId)
        database.set(toDocument(dto, database))
        return database.save()
    }

    async delete(databaseId: string | ObjectId): Promise<void> {
        const database = await this.getById(databaseId)
        await this.ensureNotViewer(database.projectId, WRITE_FORBIDDEN)
        await this.ensureWholeProject(database.projectId)
        await Database.deleteOne({ _id: database._id })
    }

    /**
     * Connects with what the form holds, without saving it. On an edit the form still carries the
     * placeholder for the credentials it never received: the database they are taken from is named in
     * `scope`, and the rule is the one of an update.
     */
    async testConnection(dto: DatabaseDTO, scope: { projectId: string } | { databaseId: string }): Promise<ConnectionTestResultDTO> {
        const stored = "databaseId" in scope ? await this.getById(scope.databaseId) : undefined
        const projectId = stored?.projectId ?? toObjectId((scope as { projectId: string }).projectId)
        if (!stored) await this.ensureAccessToProject(projectId)
        await this.ensureNotViewer(projectId, WRITE_FORBIDDEN)
        // Connects with the stored credentials of a database of the project, as an update would
        await this.ensureWholeProject(projectId)

        const { type, connection } = toConnection(dto, stored)
        const secrets = connection.authType === "credentials" ? [connection.password] : [connection.connectionString]
        return runConnectionTest(() => testDatabaseConnection(type, connection), secrets)
    }
}

export default DatabaseService
