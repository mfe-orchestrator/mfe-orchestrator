import mongoose from 'mongoose'
import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin'

export let noSQLClient: mongoose.Mongoose

export default fastifyPlugin(async (fastify: FastifyInstance) => {
  try {
    if (!process.env.NOSQL_DATABASE_URL) {
      fastify.log.warn("Cannot see MongoDB database URL, will not connect")
      return
    }

    fastify.log.info("Start connecting mongo DB")

    // Configure Mongoose for replica set
    const options: mongoose.ConnectOptions = {
      user: process.env.NOSQL_USERNAME,
      pass: process.env.NOSQL_PASSWORD,
      retryWrites: true,
      w: 'majority'
    }

    noSQLClient = await mongoose.connect(process.env.NOSQL_DATABASE_URL, options)
    
    // Verify the connection is to a replica set
    const connection = mongoose.connection
    connection.on('connected', () => {
      const isReplicaSet = connection.host.includes('replicaSet=rs0')
      fastify.log.info(`Connected to MongoDB ${isReplicaSet ? 'replica set' : 'standalone'}`)
    })

    connection.on('error', (err) => {
      fastify.log.error('MongoDB connection error:', err)
    })

    fastify.log.info('MongoDB connected successfully')
    
  } catch (err) {
    fastify.log.error('MongoDB connection error:', err)
    throw err
  }
}, { name: 'noSQL', dependencies: ['config'] })