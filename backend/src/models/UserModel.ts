import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { AuthTokenDataDTO } from "../dto/AuthTokenData.dto"
export const ISSUER = "microfrontend.orchestrator.hub"

export enum UserStatus {
    ACTIVE = "ACTIVE",
    DISABLED = "DISABLED",
    INVITED = "INVITED"
}

export interface IUser {
    _id: ObjectId
    email: string
    password?: string
    name?: string
    surname?: string
    role: string
    status: UserStatus
    isInvited?: boolean
    salt: string
    resetPasswordToken?: string
    resetPasswordExpires?: Date
    activateEmailToken?: string
    activateEmailExpires?: Date
    createdAt: Date
    updatedAt: Date
    lastLoginAt?: Date
    language?: string
    theme?: string
    marketingConsent?: boolean
    marketingConsentAt?: Date
    marketingConsentVersion?: string
}

export type IUserDocument = IUser &
    Document<ObjectId> & {
        comparePassword: (candidatePassword: string) => Promise<boolean>
        generateAuthToken: () => AuthTokenDataDTO
        toFrontendObject: () => IUser
    }

const userSchema = new Schema<IUserDocument>(
    {
        _id: { type: Schema.Types.ObjectId, auto: true },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true
        },
        password: {
            type: String,
            required: false,
            minlength: 8
        },
        resetPasswordToken: {
            type: String,
            required: false
        },
        resetPasswordExpires: {
            type: Date,
            required: false
        },
        activateEmailToken: {
            type: String,
            required: false
        },
        activateEmailExpires: {
            type: Date,
            required: false
        },
        name: {
            type: String,
            required: false,
            trim: true
        },
        surname: {
            type: String,
            required: false,
            trim: true
        },
        role: {
            type: String,
            required: true,
            enum: ["user", "admin"],
            default: "user"
        },
        status: {
            type: String,
            enum: Object.values(UserStatus),
            default: UserStatus.ACTIVE,
            required: true
        },
        isInvited: {
            type: Boolean,
            default: false
        },
        salt: {
            type: String,
            required: false
        },
        language: {
            type: String,
            enum: ["it", "en"],
            default: "it"
        },
        theme: {
            type: String,
            enum: ["LIGHT", "DARK", "SYSTEM"],
            default: "LIGHT"
        },
        // Marketing consent, recorded only where MARKETING_OPT_IN_ENABLED is on. The
        // platform never sends commercial email: it stores when the consent was given
        // and the version of the text that was accepted, which is the only thing that
        // makes the consent provable afterwards.
        marketingConsent: {
            type: Boolean,
            default: false
        },
        marketingConsentAt: {
            type: Date,
            required: false
        },
        marketingConsentVersion: {
            type: String,
            required: false
        },
        // Moment of the last access. Written by recordLogin() and read only from the
        // database: it is stripped from toFrontendObject(), so no API response
        // carries it.
        lastLoginAt: {
            type: Date,
            required: false
        }
    },
    {
        timestamps: true
    }
)

userSchema.pre<IUserDocument>("save", async function () {
    if (this.isModified("password") && this.password) {
        const salt = await bcrypt.genSalt(10)
        this.salt = salt
        this.password = await bcrypt.hash(this.password, salt)
    }
})

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password)
}

userSchema.methods.toFrontendObject = function (): IUser {
    const obj = this.toObject()
    delete obj.password
    delete obj.salt
    delete obj.__v
    // The activation and reset tokens are bearer credentials: whoever holds one
    // activates the account or changes its password without ever reading the
    // mailbox. They reach the user by email and nowhere else - registration is a
    // public route, so returning the freshly minted token in its response would
    // hand it to the caller and make the email verification a formality.
    delete obj.activateEmailToken
    delete obj.activateEmailExpires
    delete obj.resetPasswordToken
    delete obj.resetPasswordExpires
    // The access date is internal: it exists for the operator querying the
    // database, not for the client, so it never leaves the backend.
    delete obj.lastLoginAt
    return obj
}

userSchema.methods.generateAuthToken = function (): AuthTokenDataDTO {
    const payload = {
        id: this._id.toString(),
        email: this.email,
        role: this.role,
        iss: ISSUER
    }

    const accessToken = jwt.sign(payload, getSecret(), { expiresIn: "24h" })

    return {
        accessToken,
        tokenPayload: payload
    }
}

export const getSecret = () => process.env.JWT_SECRET || "your-secret-key"

const User = mongoose.model<IUserDocument>("User", userSchema)
export default User
