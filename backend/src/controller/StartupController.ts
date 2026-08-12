import { FastifyInstance } from "fastify"
import { startupRegistrationSchema } from "../schemas/startup.schema"
import ProjectService from "../service/ProjectService"
import UserService from "../service/UserService"
import AuthenticationMethod from "../types/AuthenticationMethod"

export interface StartupUserRegistrationDTO {
    email: string
    password: string
    project: string
}

export function StartupController(fastify: FastifyInstance) {
    const userService = new UserService()
    const projectService = new ProjectService()

    fastify.get("/startup/users/exists", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        const out = await userService.existsAtLeastOneUser()
        return res.send({ exists: out })
    })

    fastify.post<{ Body: StartupUserRegistrationDTO }>("/startup/registration", { config: { authMethod: AuthenticationMethod.PUBLIC }, schema: startupRegistrationSchema }, async (req, res) => {
        const registeredUser = await userService.register(
            {
                email: req.body.email,
                password: req.body.password
            },
            true
        )

        const project = await projectService.create(
            {
                name: req.body.project,
                slug: req.body.project.toLowerCase().replace(" ", "-").replace("_", "-").replace(".", "-"),
                description: req.body.project
            },
            registeredUser._id
        )

        return res.send({ user: registeredUser.toFrontendObject(), project })
    })
}

export default StartupController
