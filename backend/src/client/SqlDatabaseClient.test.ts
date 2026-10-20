import net from "net"
import { beforeAll, describe, expect, it } from "vitest"
import { DatabaseType } from "../models/DatabaseModel"
import { databaseTargetOf, testDatabaseConnection } from "./SqlDatabaseClient"

const credentials = { authType: "credentials" as const, host: "db.internal", port: 5432, database: "orders", username: "app", password: "pw", ssl: false }
const fromString = (connectionString: string) => ({ authType: "connectionString" as const, connectionString })

describe("databaseTargetOf", () => {
    it("given credentials, when they are read, then they are the target as they are", async () => {
        expect(await databaseTargetOf(DatabaseType.POSTGRESQL, credentials)).toEqual({ host: "db.internal", port: 5432, database: "orders", user: "app", password: "pw", ssl: false })
    })

    /** pg would read those files from the server's disk while building its client */
    it("given a Postgres URL naming certificate files, when it is read, then only the address, the account and SSL are kept", async () => {
        const target = await databaseTargetOf(DatabaseType.POSTGRESQL, fromString("postgres://app:p%40ss@db.internal:6543/orders?sslmode=require&sslcert=/dev/zero&sslkey=/etc/passwd"))

        expect(target).toEqual({ host: "db.internal", port: 6543, database: "orders", user: "app", password: "p@ss", ssl: true })
    })

    /** mysql2 would copy socketPath into its options and connect to a socket of the server */
    it("given a MySQL URL with a socket path, when it is read, then the parameter is not kept", async () => {
        expect(await databaseTargetOf(DatabaseType.MARIADB, fromString("mysql://app:pw@db.internal/orders?socketPath=/var/run/mysqld/mysqld.sock"))).toEqual({
            host: "db.internal",
            port: 3306,
            database: "orders",
            user: "app",
            password: "pw",
            ssl: false
        })
    })

    it("given a SQL Server connection string, when it is read, then the driver's parser reads it", async () => {
        expect(await databaseTargetOf(DatabaseType.SQLSERVER, fromString("Server=tcp:db.internal,1444;Database=orders;User Id=app;Password={p;w};Encrypt=true"))).toEqual({
            host: "db.internal",
            port: 1444,
            database: "orders",
            user: "app",
            password: "p;w",
            ssl: true
        })
    })

    it("given an Oracle URL over TLS, when it is read, then the target asks for TLS", async () => {
        expect(await databaseTargetOf(DatabaseType.ORACLE, fromString("tcps://app:pw@db.internal:2484/ORCLPDB1"))).toMatchObject({ port: 2484, database: "ORCLPDB1", ssl: true })
    })

    it.each([
        ["a Unix socket as host", DatabaseType.POSTGRESQL, { ...credentials, host: "/var/run/postgresql" }],
        ["a host only in the query", DatabaseType.POSTGRESQL, fromString("postgres://app:pw@/orders?host=/tmp")],
        ["no password, which pg would take from the server", DatabaseType.POSTGRESQL, fromString("postgres://app@db.internal/orders")],
        ["no database, which pg would take from the server", DatabaseType.POSTGRESQL, fromString("postgres://app:pw@db.internal")],
        ["an Oracle descriptor as service", DatabaseType.ORACLE, { ...credentials, database: "x(DESCRIPTION=(ADDRESS=(HOST=evil)))" }],
        ["a URL of another engine", DatabaseType.POSTGRESQL, fromString("mysql://app:pw@db.internal/orders")],
        ["something that is not a URL", DatabaseType.MYSQL, fromString("host=db.internal user=app password=pw")]
    ])("given %s, when it is read, then it is refused", async (_case, type, connection) => {
        await expect(databaseTargetOf(type, connection as never)).rejects.toThrow()
    })

    it("given a connection string that cannot be read, when it is refused, then the message does not quote it", async () => {
        const error = await databaseTargetOf(DatabaseType.POSTGRESQL, fromString("mysql://app:s3cret@db.internal/orders")).catch((error: Error) => error)

        expect((error as Error).message).not.toContain("s3cret")
    })
})

/**
 * Against a port that refuses every connection: each driver has to load and report the refusal. A
 * driver that did not load (a named export that a CommonJS package does not have) fails differently.
 */
describe("testDatabaseConnection", () => {
    let port: number

    beforeAll(async () => {
        const server = net.createServer()
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
        port = (server.address() as net.AddressInfo).port
        await new Promise(resolve => server.close(resolve))
    })

    it.each([DatabaseType.POSTGRESQL, DatabaseType.MYSQL, DatabaseType.MARIADB, DatabaseType.SQLSERVER, DatabaseType.ORACLE])(
        "given %s on a closed port, when the connection is tested, then the driver reports it",
        async type => {
            const error = await testDatabaseConnection(type, { authType: "credentials", host: "127.0.0.1", port, database: "db", username: "app", password: "pw", ssl: false }).catch(
                (error: Error) => error
            )

            expect(error).toBeInstanceOf(Error)
            expect(String((error as Error).message) + String((error as { errors?: unknown[] }).errors ?? "")).not.toMatch(/is not a function|is not a constructor|Cannot find module/)
        },
        20_000
    )
})
