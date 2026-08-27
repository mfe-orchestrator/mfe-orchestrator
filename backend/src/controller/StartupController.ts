import { FastifyInstance } from "fastify"
import OrganizationService from "../service/OrganizationService"
import ProjectService from "../service/ProjectService"
import UserService from "../service/UserService"
import AuthenticationMethod from "../types/AuthenticationMethod"

export interface StartupUserRegistrationDTO {
    email: string
    password: string
    project: string
    /** Optional: left out, the first organization is named after the first project. */
    organization?: string
}

export function StartupController(fastify: FastifyInstance) {
    const userService = new UserService()

    fastify.get("/startup/users/exists", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        const out = await userService.existsAtLeastOneUser()
        return res.send({ exists: out })
    })

    fastify.post<{ Body: StartupUserRegistrationDTO }>("/startup/registration", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        const registeredUser = await userService.register(
            {
                email: req.body.email,
                password: req.body.password
            },
            true
        )

        // The very first user owns the organization everything else hangs from: the project cannot be
        // created before it exists, and the services are built with that user so the ownership check
        // on project creation sees the owner it just created.
        const organizationName = req.body.organization?.trim() || req.body.project
        const organization = await new OrganizationService(registeredUser).create(
            {
                name: organizationName,
                description: organizationName
            },
            registeredUser._id
        )

        const project = await new ProjectService(registeredUser).create(
            {
                organizationId: organization._id.toString(),
                name: req.body.project,
                slug: req.body.project.toLowerCase().replace(" ", "-").replace("_", "-").replace(".", "-"),
                description: req.body.project
            },
            registeredUser._id
        )

        return res.send({ user: registeredUser.toFrontendObject(), organization, project })
    })
}

export default StartupController
