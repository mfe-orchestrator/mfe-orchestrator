import { DatabaseConnection, DatabaseType } from "../models/DatabaseModel"
import { withTimeout } from "../utils/connectionTest"

/** How long a connection attempt may take before the database counts as unreachable */
export const CONNECT_TIMEOUT_MS = 5000

/**
 * Where a test connects and as whom: the only fields that ever reach a driver. A connection string is
 * never handed to one as it is, because the drivers act on what it says beyond the address: pg reads
 * from disk the files its sslcert, sslkey and sslrootcert parameters name, mysql2 copies every query
 * parameter into its options (socketPath among them).
 */
export interface DatabaseTarget {
    host: string
    port: number
    database: string
    user: string
    password: string
    ssl: boolean
}

const DEFAULT_PORT: Record<DatabaseType, number> = {
    [DatabaseType.POSTGRESQL]: 5432,
    [DatabaseType.MYSQL]: 3306,
    [DatabaseType.MARIADB]: 3306,
    [DatabaseType.SQLSERVER]: 1433,
    [DatabaseType.ORACLE]: 1521
}

const URL_SCHEMES: Partial<Record<DatabaseType, string[]>> = {
    [DatabaseType.POSTGRESQL]: ["postgres:", "postgresql:"],
    [DatabaseType.MYSQL]: ["mysql:", "mariadb:"],
    [DatabaseType.MARIADB]: ["mysql:", "mariadb:"],
    // tcps:// asks for TLS: Oracle connect strings (EZConnect, descriptors) carry no account, so this URL does
    [DatabaseType.ORACLE]: ["oracle:", "tcps:"]
}

/** A host name or an IP address: not a Unix socket path, not a connect descriptor */
const HOST = /^[A-Za-z0-9_.:-]+$/
/** Oracle puts the service in the connect string it builds, where a parenthesis would start a descriptor */
const ORACLE_SERVICE = /^[A-Za-z0-9_.$#-]+$/

const SSL_MODES = ["require", "verify-ca", "verify-full"]

/** Its error messages never quote the string: it carries the password */
const urlTargetOf = (type: DatabaseType, connectionString: string): DatabaseTarget => {
    const schemes = URL_SCHEMES[type] ?? []
    let url: URL
    try {
        url = new URL(connectionString)
    } catch {
        throw new Error(`The connection string is not a URL starting with ${schemes[0]}//`)
    }
    if (!schemes.includes(url.protocol)) {
        throw new Error(`The connection string of this engine starts with ${schemes.join("// or ")}//`)
    }
    return {
        host: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port ? Number(url.port) : DEFAULT_PORT[type],
        database: decodeURIComponent(url.pathname.slice(1)),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        ssl: url.protocol === "tcps:" || SSL_MODES.includes(url.searchParams.get("sslmode") ?? "") || url.searchParams.get("ssl") === "true"
    }
}

/** The ADO.NET string of SQL Server, read by the driver's own parser, which only parses */
const sqlServerTargetOf = async (connectionString: string): Promise<DatabaseTarget> => {
    const { ConnectionPool } = (await import("mssql")).default
    const config = ConnectionPool.parseConnectionString(connectionString)
    return {
        host: config.server ?? "",
        port: config.port ?? DEFAULT_PORT[DatabaseType.SQLSERVER],
        database: config.database ?? "",
        user: config.user ?? "",
        password: config.password ?? "",
        ssl: config.options?.encrypt === true
    }
}

/**
 * The target of a test, checked. The account is required even where a driver would do without: pg falls
 * back on the server's own PGPASSWORD, PGDATABASE and ~/.pgpass, and would hand them to the host tested.
 */
export const databaseTargetOf = async (type: DatabaseType, connection: DatabaseConnection): Promise<DatabaseTarget> => {
    const target =
        connection.authType === "credentials"
            ? { host: connection.host, port: connection.port, database: connection.database, user: connection.username, password: connection.password, ssl: connection.ssl }
            : type === DatabaseType.SQLSERVER
              ? await sqlServerTargetOf(connection.connectionString)
              : urlTargetOf(type, connection.connectionString)

    if (!HOST.test(target.host)) throw new Error("The host is not a host name or an IP address")
    if (!Number.isInteger(target.port) || target.port < 1 || target.port > 65535) throw new Error("The port is not a number between 1 and 65535")
    if (!target.user || !target.password) throw new Error("The connection string has no user or password")
    if ((type === DatabaseType.POSTGRESQL || type === DatabaseType.ORACLE) && !target.database) throw new Error("The connection string names no database")
    if (type === DatabaseType.ORACLE && !ORACLE_SERVICE.test(target.database)) throw new Error("The service name holds characters an Oracle service name cannot")
    return target
}

const testPostgres = async (target: DatabaseTarget): Promise<void> => {
    // CommonJS packages: what they export is the default of the dynamic import
    const { Client } = (await import("pg")).default
    const client = new Client({ ...target, connectionTimeoutMillis: CONNECT_TIMEOUT_MS })
    try {
        await client.connect()
        await client.query("SELECT 1")
    } finally {
        await client.end().catch(() => undefined)
    }
}

/** MariaDB speaks the MySQL protocol: one driver for both */
const testMysql = async (target: DatabaseTarget): Promise<void> => {
    const mysql = (await import("mysql2/promise")).default
    const client = await mysql.createConnection({
        ...target,
        ssl: target.ssl ? { rejectUnauthorized: true } : undefined,
        connectTimeout: CONNECT_TIMEOUT_MS,
        // A server answering a query with LOAD DATA LOCAL would otherwise be asking for a file of ours
        flags: ["-LOCAL_FILES"]
    })
    try {
        await client.query("SELECT 1")
    } finally {
        await client.end().catch(() => undefined)
    }
}

const testSqlServer = async (target: DatabaseTarget): Promise<void> => {
    const { ConnectionPool } = (await import("mssql")).default
    const pool = new ConnectionPool({
        server: target.host,
        port: target.port,
        database: target.database || undefined,
        user: target.user,
        password: target.password,
        connectionTimeout: CONNECT_TIMEOUT_MS,
        requestTimeout: CONNECT_TIMEOUT_MS,
        options: { encrypt: target.ssl, trustServerCertificate: false }
    })
    try {
        await pool.connect()
        await pool.request().query("SELECT 1")
    } finally {
        await pool.close().catch(() => undefined)
    }
}

const testOracle = async (target: DatabaseTarget): Promise<void> => {
    const oracledb = (await import("oracledb")).default
    // Thin mode, the default: no Oracle client libraries are installed in the image
    const client = await oracledb.getConnection({
        user: target.user,
        password: target.password,
        connectString: `${target.ssl ? "tcps://" : ""}${target.host.includes(":") ? `[${target.host}]` : target.host}:${target.port}/${target.database}`,
        connectTimeout: CONNECT_TIMEOUT_MS / 1000
    })
    // connectTimeout bounds the connection only: this bounds the query
    client.callTimeout = CONNECT_TIMEOUT_MS
    try {
        await client.execute("SELECT 1 FROM DUAL")
    } finally {
        await client.close().catch(() => undefined)
    }
}

const TESTERS: Record<DatabaseType, (target: DatabaseTarget) => Promise<void>> = {
    [DatabaseType.POSTGRESQL]: testPostgres,
    [DatabaseType.MYSQL]: testMysql,
    [DatabaseType.MARIADB]: testMysql,
    [DatabaseType.SQLSERVER]: testSqlServer,
    [DatabaseType.ORACLE]: testOracle
}

/**
 * Connects with the engine's own driver, runs the cheapest query it has and disconnects; throws what the
 * driver said when that fails. The drivers are loaded on the first test, not at boot: most installations
 * never connect a database.
 */
export const testDatabaseConnection = async (type: DatabaseType, connection: DatabaseConnection): Promise<void> => {
    const target = await databaseTargetOf(type, connection)
    await withTimeout(TESTERS[type](target), 3 * CONNECT_TIMEOUT_MS, "The connection test")
}
