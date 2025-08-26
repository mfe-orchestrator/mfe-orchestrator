import UserRegistrationDTO from "../types/UserRegistrationDTO"
import UserLoginDTO from "../types/UserLoginDTO"
import ResetPasswordRequestDTO from "../types/ResetPasswordRequestDTO"
import ResetPasswordDataDTO from "../types/ResetPasswordDataDTO"
import { UserInvitationDTO } from "../types/UserInvitationDTO"
import { AuthenticationMethod, FastifyInstance } from "fastify"
import UserService from "../service/UserService"
import UserAccoutActivationDTO from "../types/UserAccoutActivationDTO"

export function UserController(fastify: FastifyInstance) {
    const userService = new UserService()

    fastify.post<{
        Body: UserRegistrationDTO
    }>("/users/registration", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        const out = await userService.register(req.body, true)
        return res.send(out.toFrontendObject())
    })

    fastify.post<{
        Body: UserAccoutActivationDTO
    }>("/users/account-activation", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        await userService.activate(req.body)
        return res.send()
    })

    fastify.post<{
        Body: UserLoginDTO
    }>("/users/login", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        return res.send(await userService.login(req.body))
    })

    fastify.post<{
        Body: ResetPasswordRequestDTO
    }>("/users/forgot-password", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        await userService.requestPasswordReset(req.body.email)
        return res.send()
    })

    fastify.post<{
        Body: ResetPasswordDataDTO
    }>("/users/reset-password", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
        await userService.resetPassword(req.body)
        return res.send()
    })

    fastify.get("/users/profile", async (req, res) => {
        return res.send(await userService.getProfile(req.databaseUser._id))
    })

    fastify.post<{
        Body: UserInvitationDTO
    }>("/users/invitation", async (req, res) => {
        return res.send(await userService.inviteUser(req.body))
    })

    fastify.post<{ Body: { theme: string } }>("/users/theme", async (req, res) => {
        return res.send(await userService.saveTheme(req.body.theme, req.databaseUser._id))
    })

    fastify.post<{ Body: { language: string } }>("/users/language", async (req, res) => {
        return res.send(await userService.saveLanguage(req.body.language, req.databaseUser._id))
    })
}

export default UserController
