import { describe, expect, it } from "vitest"
import { BusinessException } from "../errors/BusinessException"
import { DatabaseConnection } from "../models/DatabaseModel"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import { normalizeConnection } from "./DatabaseService"

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

    it("given no database to take it from, when the placeholder is submitted, then the password is missing", () => {
        expect(codeOf(() => normalizeConnection(credentials(SECRET_PLACEHOLDER)))).toBe("DATABASE_CONNECTION_INVALID")
    })

    it("given a switch to a connection string, when the placeholder is submitted, then the stored password does not stand in for it", () => {
        expect(codeOf(() => normalizeConnection({ authType: "connectionString", connectionString: SECRET_PLACEHOLDER }, stored))).toBe("DATABASE_CONNECTION_INVALID")
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
