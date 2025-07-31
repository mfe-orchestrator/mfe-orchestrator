import { FastifyRequest } from "fastify";

export const getEnvironmentIdFromRequest = (request: FastifyRequest) : string | undefined=> {
    return request.headers.environmentId as string | undefined;
}

export const getProjectIdFromRequest = (request: FastifyRequest)  : string | undefined=> {
    return request.headers.projectId as string | undefined;
}