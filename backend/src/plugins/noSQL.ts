import mongoose from "mongoose"
import { FastifyInstance } from "fastify"
import fastifyPlugin from "fastify-plugin"

export let noSQLClient: mongoose.Mongoose
export let isReplicaSet: boolean = false

export default fastifyPlugin(
    (fastify: FastifyInstance, opts, done) => {
        try {
            if (!fastify.config.NOSQL_DATABASE_URL) {
                fastify.log.warn("Cannot see MongoDB database URL, will not connect")
                return
            }

            fastify.log.info("Start connecting mongo DB")

            // Configure Mongoose for replica set
            const options: mongoose.ConnectOptions = {
                user: fastify.config.NOSQL_DATABASE_USERNAME,
                pass: fastify.config.NOSQL_DATABASE_PASSWORD,
                dbName: fastify.config.NOSQL_DATABASE_NAME,
                retryWrites: true,
                w: "majority"
            }

            mongoose.connect(fastify.config.NOSQL_DATABASE_URL, options)

            // Verify the connection is to a replica set
            const connection = mongoose.connection
            connection.on("connected", async () => {
                try {
                    noSQLClient = mongoose
                    const admin = noSQLClient.connection.db?.admin()
                    if (!admin) {
                        fastify.log.error("Admin database not found")
                        return
                    }
                    const info = await admin.command({ hello: 1 }) // fallback a { isMaster: 1 } per versioni molto vecchie

                    if (info.setName) {
                        fastify.log.info(`Connected to replica set: ${info.setName}`)
                        isReplicaSet = true
                    } else {
                        fastify.log.warn("Connected to standalone MongoDB (not replica set)")
                        isReplicaSet = false
                    }
                } catch (e) {
                    fastify.log.error("Error while checking replica set status:", e)
                }
                done()
            })

            connection.on("error", err => {
                fastify.log.error("MongoDB connection error:", err)
                done(err)
            })

            fastify.log.info("MongoDB started connection....")
        } catch (err) {
            fastify.log.error("MongoDB connection error:", err)
            throw err
        }
    },
    { name: "noSQL", dependencies: ["config"] }
)
