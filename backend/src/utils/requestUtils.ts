import { FastifyRequest } from "fastify";

export const getEnvironmentIdFromRequest = (request: FastifyRequest) : string | undefined=> {
    return request.headers["environment-id"] as string | undefined;
}

export const getProjectIdFromRequest = (request: FastifyRequest)  : string | undefined=> {
    return request.headers["project-id"] as string | undefined;
}