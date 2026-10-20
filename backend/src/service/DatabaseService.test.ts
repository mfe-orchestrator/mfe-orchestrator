import { describe, expect, it } from "vitest"
import { BusinessException } from "../errors/BusinessException"
import { DatabaseConnection, DatabaseType, IDatabase } from "../models/DatabaseModel"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import { normalizeConnection, toConnection } from "./DatabaseService"

const credentials = (password: string) => ({ authType: "credentials", host: " db.internal ", port: "5432", database: "orders", username: "app", password, ssl: true })

const stored: DatabaseConnection = { authType: "credentials", host: "db.internal", port: 5432, database: "orders", username: "app", password: "the-real-password", ssl: true }

const codeOf = (run: () => unknown): string | undefined => {
    try {
        run()
    } catch (error) {
        return (error as BusinessException).code
    }
}

describe("normalizeConnection", () => {
    it("given credentials, when they are normalized, then the address is trimmed and the port is a number", () => {
        expect(normalizeConnection(credentials("secret"))).toEqual({ authType: "credentials", host: "db.internal", port: 5432, database: "orders", username: "app", password: "secret", ssl: true })
    })

    /** The form submits every field, including the one it only ever received as bullets. */
    it("given the placeholder came back, when the database is updated, then the stored password is kept", () => {
        expect(normalizeConnection(credentials(SECRET_PLACEHOLDER), stored)).toMatchObject({ password: "the-real-password" })
    })

    it("given no database to take it from, when the placeholder is submitted, then the password has to be typed", () => {
        expect(codeOf(() => normalizeConnection(credentials(SECRET_PLACEHOLDER)))).toBe("DATABASE_SECRET_REQUIRED")
    })

    it("given a switch to a connection string, when the placeholder is submitted, then the stored password does not stand in for it", () => {
        expect(codeOf(() => normalizeConnection({ authType: "connectionString", connectionString: SECRET_PLACEHOLDER }, stored))).toBe("DATABASE_SECRET_REQUIRED")
    })

    /** Otherwise whoever may edit the database could send the stored password to a host of their own */
    it.each([
        ["host", { host: "attacker.example" }],
        ["port", { port: "6543" }],
        ["database", { database: "other" }],
        ["username", { username: "admin" }]
    ])("given the %s changed, when the placeholder is submitted, then the password has to be typed again", (_field, change) => {
        expect(codeOf(() => normalizeConnection({ ...credentials(SECRET_PLACEHOLDER), ...change }, stored))).toBe("DATABASE_SECRET_REQUIRED")
    })

    it("given the address changed, when a new password is typed, then it is accepted", () => {
        expect(normalizeConnection({ ...credentials("new-password"), host: "replica.internal" }, stored)).toMatchObject({ host: "replica.internal", password: "new-password" })
    })

    it("given a connection string kept as the placeholder, when it is normalized, then the stored one is kept", () => {
        const storedString: DatabaseConnection = { authType: "connectionString", connectionString: "postgres://app:pw@db/orders" }
        expect(normalizeConnection({ authType: "connectionString", connectionString: SECRET_PLACEHOLDER }, storedString)).toEqual(storedString)
    })

    it("given a connection string, when it is normalized, then the fields of the other kind are dropped", () => {
        expect(normalizeConnection({ authType: "connectionString", connectionString: "postgres://app:pw@db/orders", host: "ignored" })).toEqual({
            authType: "connectionString",
            connectionString: "postgres://app:pw@db/orders"
        })
    })

    it.each(["0", "65536", "abc", ""])("given the port %s, when it is normalized, then it is refused", port => {
        expect(codeOf(() => normalizeConnection({ ...credentials("secret"), port }))).toBe("DATABASE_PORT_INVALID")
    })

    it("given a password shaped like a ciphertext, when it is normalized, then it is refused", () => {
        expect(codeOf(() => normalizeConnection(credentials("enc:v1:abc")))).toBe("DATABASE_CONNECTION_INVALID")
    })

    it("given an unknown authType, when it is normalized, then it is refused", () => {
        expect(codeOf(() => normalizeConnection({ authType: "kerberos" }))).toBe("DATABASE_AUTH_TYPE_INVALID")
    })
})

describe("toConnection", () => {
    const database = { type: DatabaseType.POSTGRESQL, connection: stored } as unknown as IDatabase

    it("given the same engine, when the placeholder is submitted, then the stored password is kept", () => {
        expect(toConnection({ type: DatabaseType.POSTGRESQL, connection: credentials(SECRET_PLACEHOLDER) as never }, database).connection).toMatchObject({ password: "the-real-password" })
    })

    it("given another engine, when the placeholder is submitted, then the password has to be typed again", () => {
        expect(codeOf(() => toConnection({ type: DatabaseType.MYSQL, connection: credentials(SECRET_PLACEHOLDER) as never }, database))).toBe("DATABASE_SECRET_REQUIRED")
    })

    it("given an unknown engine, when it is read, then it is refused", () => {
        expect(codeOf(() => toConnection({ type: "MONGODB" as DatabaseType, connection: credentials("secret") as never }))).toBe("DATABASE_TYPE_INVALID")
    })
})
