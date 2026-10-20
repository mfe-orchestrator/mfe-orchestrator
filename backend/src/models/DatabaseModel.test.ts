import { describe, expect, it } from "vitest"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"
import Database, { DatabaseType } from "./DatabaseModel"

const postgres = () =>
    new Database({
        name: "orders",
        type: DatabaseType.POSTGRESQL,
        projectId: "68a0000000000000000000aa",
        connection: { authType: "credentials", host: "db.internal", port: 5432, database: "orders", username: "app", password: "s3cret", ssl: true }
    })

describe("toFrontendObject", () => {
    it("given a database with a password, when it is sent to the console, then the password is replaced by the placeholder", () => {
        expect((postgres().toFrontendObject().connection as Record<string, unknown>).password).toBe(SECRET_PLACEHOLDER)
    })

    it("given a database with a password, when it is sent to the console, then what addresses the database is kept", () => {
        expect(postgres().toFrontendObject().connection).toMatchObject({ host: "db.internal", port: 5432, database: "orders", username: "app" })
    })

    it("given a database without a connection string, when it is sent to the console, then no placeholder is invented for it", () => {
        expect((postgres().toFrontendObject().connection as Record<string, unknown>).connectionString).toBeUndefined()
    })
})
