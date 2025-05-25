import { FastifyInstance } from "fastify";
import fastifyPlugin from 'fastify-plugin';


export default fastifyPlugin(
  async (fastify: FastifyInstance) => {
    fastify.register(require("@fastify/helmet"), {
      crossOriginResourcePolicy: false,
    });
  },
  {}
);




//209.182.239.179
//qmSu7qkj93