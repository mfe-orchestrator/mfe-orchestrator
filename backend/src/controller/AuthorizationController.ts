import axios, { AxiosResponse } from "axios"
import { FastifyInstance } from "fastify"
import AuthenticationMethod from "../types/AuthenticationMethod"

export interface GoogleTokenResponse {
    access_token: string
    refresh_token?: string
    expires_in: number
    scope: string
    token_type: string
}

export default async function authorizationController(fastify: FastifyInstance) {

    fastify.get<{
        Querystring: {
            code: string,
        }
    }>("/auth/google", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (request, reply) => {
        const form = new URLSearchParams({
            code: request.query.code,
            client_id: fastify.config.GOOGLE_CLIENT_ID,
            client_secret: fastify.config.GOOGLE_CLIENT_SECRET,
            redirect_uri: fastify.config.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        }).toString()
        const response = await axios.request<unknown, AxiosResponse<AxiosResponse>>({
            url: 'https://oauth2.googleapis.com/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data: form
        })

        return response.data
    })

}