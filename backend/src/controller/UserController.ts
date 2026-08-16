import fastifyMultipart from "@fastify/multipart"
import { FastifyInstance } from "fastify"
import { createBusinessException } from "../errors/BusinessException"
import { MAX_AVATAR_SIZE_BYTES } from "../models/UserAvatarModel"
import UserService from "../service/UserService"
import AuthenticationMethod from "../types/AuthenticationMethod"
import ResetPasswordDataDTO from "../types/ResetPasswordDataDTO"
import ResetPasswordRequestDTO from "../types/ResetPasswordRequestDTO"
import UserAccoutActivationDTO from "../types/UserAccoutActivationDTO"
import { UserInvitationDTO } from "../types/UserInvitationDTO"
import UserLoginDTO from "../types/UserLoginDTO"
import UserProfileUpdateDTO from "../types/UserProfileUpdateDTO"
import UserRegistrationDTO from "../types/UserRegistrationDTO"

export async function UserController(fastify: FastifyInstance) {
    const userService = new UserService()

    fastify.post<{
        Body: UserRegistrationDTO
    }>("/users/registration", { config: { authMethod: AuthenticationMethod.PUBLIC } }, async (req, res) => {
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

    fastify.put<{
        Body: UserProfileUpdateDTO
    }>("/users/profile", async (req, res) => {
        // Field by field, like the registration route: the body describes the
        // caller's own account, so anything extra that arrived here would be a
        // user editing parts of their document they are not allowed to touch.
        return res.send(
            await userService.updateProfile(
                {
                    name: req.body.name,
                    surname: req.body.surname
                },
                req.databaseUser._id
            )
        )
    })

    fastify.put<{ Body: { marketingConsent: boolean } }>("/users/marketing-consent", async (req, res) => {
        return res.send(await userService.setMarketingConsent(req.body.marketingConsent === true, req.databaseUser._id))
    })

    fastify.get("/users/profile/avatar", async (req, res) => {
        return res.send({ avatar: await userService.getAvatar(req.databaseUser._id) })
    })

    fastify.delete("/users/profile/avatar", async (req, res) => {
        await userService.deleteAvatar(req.databaseUser._id)
        return res.send()
    })

    // Encapsulated scope: the multipart parser stays local to the upload route, so
    // every other endpoint keeps accepting JSON only. The parser carries the same
    // ceiling the service checks, so an oversized body is dropped while it is being
    // read instead of after a megabyte has been buffered.
    await fastify.register(async uploadScope => {
        await uploadScope.register(fastifyMultipart, {
            limits: {
                fileSize: MAX_AVATAR_SIZE_BYTES,
                files: 1
            }
        })

        uploadScope.post("/users/profile/avatar", async (req, res) => {
            const data = await req.file()
            if (!data) {
                throw createBusinessException({
                    code: "AVATAR_MISSING",
                    message: "No image was uploaded"
                })
            }
            await userService.saveAvatar(data, req.databaseUser._id)
            return res.send()
        })
    })
}

export default UserController
