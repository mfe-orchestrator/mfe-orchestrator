import { FastifyInstance, FastifyPluginOptions } from "fastify"
import fastifyEnv from "@fastify/env"
import fastifyPlugin from "fastify-plugin"

import dotenv from "dotenv"
dotenv.config()

const NODE_ENVS = Object.freeze<string[]>(["development", "prod", "test", "local"])

export default fastifyPlugin(
    (fastify: FastifyInstance, _options: FastifyPluginOptions, done: (err?: Error | undefined) => void) => {
        const schema = {
            type: "object",
            required: [],
            properties: {
                NOSQL_DATABASE_URL: {
                    type: "string"
                },
                NOSQL_DATABASEUSERNAME: {
                    type: "string"
                },
                NOSQL_DATABASEPASSWORD: {
                    type: "string"
                },
                NOSQL_DATABASE_NAME: {
                    type: "string"
                },
                REGISTRATION_ALLOWED: {
                    type: "boolean",
                    default: true
                },
                ALLOW_EMBEDDED_LOGIN: {
                    type: "boolean",
                    default: true
                },
                REDIS_URL: {
                    type: "string"
                },
                REDIS_PASSWORD: {
                    type: "string"
                },
                EMAIL_SMTP_HOST: {
                    type: "string"
                },
                EMAIL_SMTP_PORT: {
                    type: "number",
                    default: 587
                },
                EMAIL_SMTP_SECURE: {
                    type: "boolean",
                    default: false
                },
                EMAIL_SMTP_USER: {
                    type: "string"
                },
                EMAIL_SMTP_PASSWORD: {
                    type: "string"
                },
                EMAIL_SMTP_FROM: {
                    type: "string"
                },
                FRONTEND_URL: {
                    type: "string"
                },
                BACKEND_URL: {
                    type: "string"
                },
                AUTH0_DOMAIN: {
                    type: "string"
                },
                AUTH0_CLIENT_ID: {
                    type: "string"
                },
                AUTH0_SCOPE: {
                    type: "string",
                    default: "openid profile email"
                },
                AUTH0_AUDIENCE: {
                    type: "string"
                },
                ALLOWED_ORIGINS: {
                    type: "string"
                },
                AZURE_ENTRAID_TENANT_ID: {
                    type: "string"
                },
                AZURE_ENTRAID_CLIENT_ID: {
                    type: "string"
                },
                AZURE_ENTRAID_REDIRECT_URI: {
                    type: "string"
                },
                AZURE_ENTRAID_AUTHORITY: {
                    type: "string",
                    default: "https://login.microsoftonline.com"
                },
                AZURE_ENTRAID_SCOPES: {
                    type: "string",
                    default: "openid profile email"
                },
                AZURE_ENTRAID_API_AUDIENCE: {
                    type: "string"
                },
                GOOGLE_CLIENT_ID: {
                    type: "string"
                },
                GOOGLE_REDIRECT_URI: {
                    type: "string"
                },
                GOOGLE_AUTH_SCOPE: {
                    type: "string",
                    default: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
                },
                GOOGLE_AUTH_HOSTED_DOMAIN: {
                    type: "string",
                    default: ""
                },
                GOOGLE_API_AUDIENCE: {
                    type: "string"
                },
                HOST: {
                    type: "string"
                },
                NOSQL_DB_URL: {
                    type: "string"
                },
                NOSQL_DB_DATABASE: {
                    type: "string"
                },
                NOSQL_DB_PASSWORD: {
                    type: "string"
                },
                PORT: {
                    type: "number",
                    default: 3000
                },
                NODE_ENV: {
                    type: "string",
                    default: "prod"
                },
                MICROFRONTEND_HOST_FOLDER: {
                    type: "string",
                    default: "/upload-microfrontends"
                },
                RECAPTCHA_SECRET_KEY: {
                    type: "string"
                },
                BREVO_API_KEY: {
                    type: "string"
                },
                BREVO_LIST_ID: {
                    type: "string"
                },
                CODE_REPOSITORY_GITHUB_CLIENT_ID: {
                    type: "string"
                },
                CODE_REPOSITORY_GITHUB_CLIENT_SECRET: {
                    type: "string"
                }
            }
        }

        const configOptions = {
            // decorate the Fastify server instance with `config` key
            // such as `fastify.config('PORT')
            confKey: "config",
            // schema to validate
            schema: schema,
            // source for the configuration data
            data: process.env,
            // will read .env in root folder
            dotenv: true,
            // will remove the additional properties
            // from the data object which creates an
            // explicit schema
            removeAdditional: true
        }

        /* istanbul ignore next */
        if (NODE_ENVS.find(validName => validName === (process.env.NODE_ENV ?? "prod")) === undefined) {
            throw new Error("NODE_ENV is not valid, it must be one of 'prod', 'test' or 'local', not \"" + process.env.NODE_ENV + '"')
        }

        fastifyEnv(fastify, configOptions, done)
    },
    { name: "config" }
)
