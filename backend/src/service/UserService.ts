import { MultipartFile } from "@fastify/multipart"
import { randomBytes } from "crypto"
import { Schema } from "mongoose"
import { fastify } from ".."
import AuthenticationError from "../errors/AuthenticationError"
import { createBusinessException } from "../errors/BusinessException"
import { InvalidCredentialsError } from "../errors/InvalidCredentialsError"
import { UserAlreadyExistsError } from "../errors/UserAlreadyExistsError"
import { UserNotFoundError } from "../errors/UserNotFoundError"
import UserAvatar, { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE_BYTES } from "../models/UserAvatarModel"
import User, { IUser, UserStatus } from "../models/UserModel"
import ResetPasswordDataDTO from "../types/ResetPasswordDataDTO"
import UserAccoutActivationDTO from "../types/UserAccoutActivationDTO"
import { UserInvitationDTO } from "../types/UserInvitationDTO"
import UserLoginDTO from "../types/UserLoginDTO"
import UserProfileUpdateDTO from "../types/UserProfileUpdateDTO"
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

/**
 * Fallback window for a federated access whose token carries no authentication
 * moment: an opaque token (a Google access token is not a JWT) leaves nothing to
 * read, so the access is dated "now" and the window keeps ordinary request traffic
 * from writing on the user document over and over.
 *
 * Only that fallback is approximate. When the token does state when the provider
 * authenticated the user, `recordLogin` stores exactly that moment.
 */
export const FEDERATED_LOGIN_WINDOW_MS = 15 * 60 * 1000

/**
 * Stores the moment of an access on the user document.
 *
 * The write happens only when `at` is newer than what is already stored: the
 * authorization hook calls this on every federated request, always with the
 * authentication moment of the same token, so re-seeing that token is not a new
 * login and must not move the field. `minGapMs` covers the caller that has no
 * authentication moment to pass and has to date the access "now".
 *
 * A failed write never fails the request: the field is an operational record, and
 * an authenticated user losing access because a bookkeeping update timed out would
 * be a far worse outcome than a missing date.
 *
 * Deliberately not a method of `UserService`: the authorization hook calls it on
 * every federated request, and building a service there would build an
 * `EmailService`, hence an SMTP transport, to run one `updateOne`.
 */
export const recordLogin = async (user: Pick<IUser, "_id" | "lastLoginAt">, at: Date = new Date(), minGapMs: number = 0): Promise<void> => {
    if (user.lastLoginAt) {
        const elapsed = at.getTime() - user.lastLoginAt.getTime()
        if (elapsed <= 0 || elapsed < minGapMs) {
            return
        }
    }

    const userId = toObjectId(user._id)
    try {
        // Timestamps off on purpose: an access is not a change to the user, and
        // letting it bump `updatedAt` would turn that field into "last seen" for
        // every user in the collection.
        await User.updateOne({ _id: userId }, { lastLoginAt: at }, { timestamps: false })
    } catch (error) {
        fastify?.log?.warn({ err: error, userId: userId.toString() }, "Unable to record the last login date")
    }
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

        await recordLogin(user)

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

        // The reset exists only as a link in an email, so without a mail channel there is
        // nowhere to deliver it. Registration and invitations have something to degrade
        // into when SMTP is missing - an account that is simply active - this one has not:
        // minting the token anyway would leave a valid credential on the account that
        // nobody can reach, and the send would fail afterwards, once the caller has already
        // been told the email is on its way. It refuses before writing anything instead.
        if (!this.emailService.canSendEmails()) {
            throw createBusinessException({
                code: "EMAIL_NOT_CONFIGURED",
                message: "Email delivery is not configured, the password cannot be reset"
            })
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

    /**
     * Updates the personal data the user is allowed to change about themselves.
     *
     * Only `name` and `surname` are read from the payload: the caller is the
     * account owner, so spreading the body here would let anybody promote
     * themselves to `role: "admin"` or move their account to another email.
     *
     * An empty string clears the field instead of storing a blank: the schema
     * trims, and a user who deletes their surname means they have none, not that
     * they have one made of spaces.
     */
    async updateProfile(data: UserProfileUpdateDTO, _id: string | Schema.Types.ObjectId): Promise<IUser> {
        const user = await User.findOne({ _id: toObjectId(_id) })
        if (!user) {
            throw new UserNotFoundError(_id.toString())
        }

        if (data.name !== undefined) {
            user.name = data.name.trim() || undefined
        }
        if (data.surname !== undefined) {
            user.surname = data.surname.trim() || undefined
        }

        await user.save()
        return user.toFrontendObject()
    }

    /**
     * Grants or withdraws the marketing consent from the profile page.
     *
     * Granting stores the moment and the version of the text in force, the same
     * pair `buildMarketingConsent` writes at registration: a consent without the
     * wording it was given for is not provable afterwards.
     *
     * Withdrawing clears both. They describe a consent that no longer holds, and
     * leaving a date next to `marketingConsent: false` would read as if the
     * consent were still the one given on that day. Keeping the history of the
     * changes is a different feature and would need its own log collection: this
     * field pair only ever describes the consent currently in force.
     */
    async setMarketingConsent(marketingConsent: boolean, _id: string | Schema.Types.ObjectId): Promise<IUser> {
        if (!fastify.config?.MARKETING_OPT_IN_ENABLED) {
            throw createBusinessException({
                code: "MARKETING_OPT_IN_DISABLED",
                message: "This installation does not collect a marketing consent"
            })
        }

        const user = await User.findOne({ _id: toObjectId(_id) })
        if (!user) {
            throw new UserNotFoundError(_id.toString())
        }

        if (marketingConsent) {
            user.marketingConsent = true
            user.marketingConsentAt = new Date()
            user.marketingConsentVersion = fastify.config.MARKETING_OPT_IN_VERSION
        } else {
            user.marketingConsent = false
            user.marketingConsentAt = undefined
            user.marketingConsentVersion = undefined
        }

        await user.save()
        return user.toFrontendObject()
    }

    /**
     * Stores the uploaded picture, replacing whatever the user had before.
     *
     * The declared mime type is checked against a whitelist and never trusted to
     * decide what gets served back: `getAvatar` reads the stored value, which is
     * one of the four accepted formats precisely because this check ran first.
     *
     * The size is verified on the buffer and not on the multipart headers. The
     * parser is configured with the same limit, so an oversized upload is
     * normally refused before reaching here, but a client that lies about the
     * length must not be the reason the check happens.
     */
    async saveAvatar(file: MultipartFile, _id: string | Schema.Types.ObjectId): Promise<void> {
        if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
            throw createBusinessException({
                code: "AVATAR_INVALID_FORMAT",
                message: `Unsupported image format: ${file.mimetype}. Allowed formats are ${ALLOWED_AVATAR_MIME_TYPES.join(", ")}`
            })
        }

        const data = await file.toBuffer()

        if (data.length === 0) {
            throw createBusinessException({
                code: "AVATAR_EMPTY",
                message: "The uploaded image is empty"
            })
        }

        if (data.length > MAX_AVATAR_SIZE_BYTES) {
            throw createBusinessException({
                code: "AVATAR_TOO_LARGE",
                message: `The image exceeds the maximum size of ${MAX_AVATAR_SIZE_BYTES} bytes`
            })
        }

        await UserAvatar.updateOne(
            { userId: toObjectId(_id) },
            {
                data,
                mimeType: file.mimetype,
                size: data.length
            },
            { upsert: true }
        )
    }

    /**
     * Returns the stored picture as a data URI, or null when the user never
     * uploaded one.
     *
     * A data URI and not a URL to a binary endpoint: the picture is behind
     * authentication, and the `src` of an `<img>` carries no Authorization
     * header, so a plain URL would force the frontend to either fetch the bytes
     * by hand or expose the endpoint publicly.
     */
    async getAvatar(_id: string | Schema.Types.ObjectId): Promise<string | null> {
        const avatar = await UserAvatar.findOne({ userId: toObjectId(_id) })
        if (!avatar) {
            return null
        }

        return `data:${avatar.mimeType};base64,${avatar.data.toString("base64")}`
    }

    async deleteAvatar(_id: string | Schema.Types.ObjectId): Promise<void> {
        await UserAvatar.deleteOne({ userId: toObjectId(_id) })
    }
}

export default UserService
