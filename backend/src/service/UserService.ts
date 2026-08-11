import { randomBytes } from "crypto"
import { Schema } from "mongoose"
import { fastify } from ".."
import AuthenticationError from "../errors/AuthenticationError"
import { InvalidCredentialsError } from "../errors/InvalidCredentialsError"
import { UserAlreadyExistsError } from "../errors/UserAlreadyExistsError"
import { UserNotFoundError } from "../errors/UserNotFoundError"
import User, { IUser, UserStatus } from "../models/UserModel"
import ResetPasswordDataDTO from "../types/ResetPasswordDataDTO"
import UserAccoutActivationDTO from "../types/UserAccoutActivationDTO"
import { UserInvitationDTO } from "../types/UserInvitationDTO"
import UserLoginDTO from "../types/UserLoginDTO"
import UserRegistrationDTO from "../types/UserRegistrationDTO"
import { toObjectId } from "../utils/mongooseUtils"
import EmailService from "./EmailSenderService"

/**
 * The fields `register` accepts. `status` is reachable only from the internal
 * callers that provision a user outside the public endpoint (federated login and
 * project invitation): the controller never forwards it from a request body.
 */
type RegisterUserData = UserRegistrationDTO & {
    status?: UserStatus
}

export class UserService {
    private emailService: EmailService

    constructor(emailService?: EmailService) {
        this.emailService = emailService || new EmailService()
    }

    async activate(data: UserAccoutActivationDTO) {
        const user = await User.findOne({ activateEmailToken: data.token })
        if (!user) {
            throw new UserNotFoundError(data.token)
        }

        if (!user.activateEmailToken) {
            return
        }

        if (user.activateEmailExpires && user.activateEmailExpires < new Date()) {
            throw new Error("Activation token expired")
        }

        user.status = UserStatus.ACTIVE
        user.activateEmailToken = undefined
        user.activateEmailExpires = undefined
        await user.save()
    }

    /**
     * Builds the consent fields to store for a new user.
     *
     * The consent is recorded only where the installation declares it collects
     * one: `MARKETING_OPT_IN_ENABLED` is off unless the operator turns it on, so
     * an installation without a mailing list stores nothing. The version of the
     * accepted text travels with the consent, it is the only thing that keeps an
     * old consent attributable to the wording it was given for.
     */
    private buildMarketingConsent(marketingConsent?: boolean): Partial<IUser> {
        if (!fastify.config?.MARKETING_OPT_IN_ENABLED || marketingConsent !== true) {
            return {}
        }

        return {
            marketingConsent: true,
            marketingConsentAt: new Date(),
            marketingConsentVersion: fastify.config.MARKETING_OPT_IN_VERSION
        }
    }

    async register(userData: RegisterUserData, verifyEmail: boolean = true) {
        const { email, password, name, surname, status, marketingConsent } = userData
        if (!email) {
            throw new Error("Email is required")
        }
        const existingUser = await User.findOne({ email })

        const canVerifyEmail = verifyEmail && this.emailService.canSendEmails()

        if (existingUser) {
            throw new UserAlreadyExistsError(email)
        }

        // Only the fields listed here are taken from the request: registration is a
        // public endpoint, so spreading its body would let anybody sign up with
        // `role: "admin"` or with a consent the installation never asked for.
        const userToSave: Partial<IUser> = {
            email,
            password,
            name,
            surname,
            status,
            ...this.buildMarketingConsent(marketingConsent)
        }

        if (canVerifyEmail) {
            userToSave.activateEmailToken = randomBytes(32).toString("hex")
            userToSave.activateEmailExpires = new Date(Date.now() + 60 * 60 * 1000 * 24) // 24 hours
        }

        const user = new User(userToSave)
        await user.save()

        if (canVerifyEmail && userToSave.activateEmailToken) {
            await this.emailService.sendVerificationEmail(email, userToSave.activateEmailToken)
        }

        return user
    }

    async existsAtLeastOneUser() {
        const users = await User.find()
        return users.length > 0
    }

    async login(loginData: UserLoginDTO) {
        const { email, password } = loginData
        const user = await User.findOne({ email })

        if (!user?.password) {
            throw new AuthenticationError("This email is associated to an account created with an external provider")
        }

        if (!user) {
            throw new UserNotFoundError(email)
        }

        const isValidPassword = await user.comparePassword(password)
        if (!isValidPassword) {
            throw new InvalidCredentialsError()
        }

        return {
            user: user.toFrontendObject(),
            ...user.generateAuthToken()
        }
    }

    async inviteUser(invitationData: UserInvitationDTO): Promise<IUser> {
        const { email, name, surname, role } = invitationData
        const existingUser = await User.findOne({ email })

        if (existingUser) {
            throw new UserAlreadyExistsError(email)
        }

        // Generate a temporary password for the new user
        const tempPassword = randomBytes(16).toString("hex")

        const user = new User({
            email,
            password: tempPassword,
            name,
            surname,
            role,
            isInvited: true,
            salt: tempPassword // We need to set the salt for password hashing
        })

        await user.save()
        return user
    }

    async requestPasswordReset(email: string): Promise<void> {
        const user = await User.findOne({ email })
        if (!user) {
            throw new UserNotFoundError(email)
        }

        const resetToken = randomBytes(32).toString("hex")
        user.resetPasswordToken = resetToken
        user.resetPasswordExpires = new Date(Date.now() + 3600000) // 1 hour
        await user.save()

        await this.emailService.sendResetPasswordEmail(email, resetToken)
    }

    async resetPassword(data: ResetPasswordDataDTO): Promise<void> {
        const { token, password } = data
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() }
        })

        if (!user) {
            throw new Error("Invalid or expired reset password token")
        }

        user.password = password
        user.resetPasswordToken = undefined
        user.resetPasswordExpires = undefined
        await user.save()
    }

    async getProfile(id: string | Schema.Types.ObjectId) {
        const user = await User.findOne({ _id: toObjectId(id) })
        if (!user) {
            throw new UserNotFoundError(id.toString())
        }

        return user.toFrontendObject()
    }

    async saveLanguage(language: string, _id: string | Schema.Types.ObjectId): Promise<void> {
        await User.updateOne({ _id: toObjectId(_id) }, { language })
    }

    async saveTheme(theme: string, _id: string | Schema.Types.ObjectId): Promise<void> {
        await User.updateOne({ _id: toObjectId(_id) }, { theme })
    }
}

export default UserService
