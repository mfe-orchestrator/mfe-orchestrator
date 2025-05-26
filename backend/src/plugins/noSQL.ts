import mongoose from 'mongoose'
import { FastifyInstance } from 'fastify';
import fastifyPlugin from 'fastify-plugin'

export let noSQLClient: mongoose.Mongoose

export default fastifyPlugin(async (fastify: FastifyInstance) => {

  try {
    if(!process.env.NOSQL_DATABASE_URL){
        fastify.log.warn("Cannot see mongodb database URL, will not connect")
        return
    }
    
    noSQLClient = await mongoose.connect(process.env.NOSQL_DATABASE_URL)
    fastify.log.info('noSQL Database connected')
    
  } catch (err) {
    fastify.log.error(err, 'Mongoose connection error')
    throw err
  }
}, { name: 'nosql', dependencies: ['config'] })