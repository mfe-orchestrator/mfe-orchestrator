import { FastifyInstance } from "fastify"
import { accountActivationSchema, forgotPasswordSchema, invitationSchema, languageSchema, loginSchema, registrationSchema, resetPasswordSchema, themeSchema } from "../schemas/user.schema"
import UserService from "../service/UserService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import ResetPasswordDataDTO from "../types/ResetPasswordDataDTO"
import ResetPasswordRequestDTO from "../types/ResetPasswordRequestDTO"
import UserAccoutActivationDTO from "../types/UserAccoutActivationDTO"
import { UserInvitationDTO } from "../types/UserInvitationDTO"
import UserLoginDTO from "../types/UserLoginDTO"
import UserRegistrationDTO from "../types/UserRegistrationDTO"

export function UserController(fastify: FastifyInstance) {
    const userService = new UserService()

    fastify.post<{
        Body: UserRegistrationDTO
    }>("/users/registration", { config: { authMethod: AuthenticationMethod.PUBLIC }, schema: registrationSchema }, async (req, res) => {
        // The body is forwarded field by field and never spread: the route is public
        // and Fastify does not strip what the schema does not declare, so anything
        // extra that arrives here would otherwise reach the user document.
        const out = await userService.register(
            {
                email: req.body.email,
                password: req.body.password,
                name: req.body.name,
                surname: req.body.surname,
                marketingConsent: req.body.marketingConsent
            },
            true
        )
        return res.send(out.toFrontendObject())
    })

    fastify.post<{
        Body: UserAccoutActivationDTO
    }>("/users/account-activation", { config: { authMethod: AuthenticationMethod.PUBLIC }, schema: accountActivationSchema }, async (req, res) => {
        await userService.activate(req.body)
        return res.send()
    })

    fastify.post<{
        Body: UserLoginDTO
    }>("/users/login", { config: { authMethod: AuthenticationMethod.PUBLIC }, schema: loginSchema }, async (req, res) => {
        return res.send(await userService.login(req.body))
    })

    fastify.post<{
        Body: ResetPasswordRequestDTO
    }>("/users/forgot-password", { config: { authMethod: AuthenticationMethod.PUBLIC }, schema: forgotPasswordSchema }, async (req, res) => {
        await userService.requestPasswordReset(req.body.email)
        return res.send()
    })

    fastify.post<{
        Body: ResetPasswordDataDTO
    }>("/users/reset-password", { config: { authMethod: AuthenticationMethod.PUBLIC }, schema: resetPasswordSchema }, async (req, res) => {
        await userService.resetPassword(req.body)
        return res.send()
    })

    fastify.get("/users/profile", async (req, res) => {
        return res.send(await userService.getProfile(req.databaseUser._id))
    })

    fastify.post<{
        Body: UserInvitationDTO
    }>("/users/invitation", { schema: invitationSchema }, async (req, res) => {
        return res.send(await userService.inviteUser(req.body))
    })

    fastify.post<{ Body: { theme: string } }>("/users/theme", { schema: themeSchema }, async (req, res) => {
        return res.send(await userService.saveTheme(req.body.theme, req.databaseUser._id))
    })

    fastify.post<{ Body: { language: string } }>("/users/language", { schema: languageSchema }, async (req, res) => {
        return res.send(await userService.saveLanguage(req.body.language, req.databaseUser._id))
    })
}

export default UserController
