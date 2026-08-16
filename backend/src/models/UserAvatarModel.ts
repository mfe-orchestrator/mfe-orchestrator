import mongoose, { Document, ObjectId, Schema } from "mongoose"

/**
 * Formats accepted for a profile picture. The list is a whitelist and not a
 * "starts with image/" check: the picture is served back to the browser, and
 * `image/svg+xml` would be a document that executes script in the origin of the
 * application.
 */
export const ALLOWED_AVATAR_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

/**
 * Upper bound of a stored picture. A profile picture is displayed at 32 pixels
 * in the sidebar, so a megabyte is already generous, and the limit is what keeps
 * a user document from turning the collection into a file store.
 */
export const MAX_AVATAR_SIZE_BYTES = 1024 * 1024

export interface IUserAvatar {
    userId: ObjectId
    data: Buffer
    mimeType: string
    size: number
    createdAt: Date
    updatedAt: Date
}

export type IUserAvatarDocument = IUserAvatar & Document<ObjectId>

/**
 * The picture lives in its own collection, one document per user, and not as a
 * field of the user. Every authenticated request loads the user document, and
 * keeping a megabyte of binary inside it would make the platform read that
 * megabyte on each of those requests to answer questions that never involve the
 * picture.
 */
const userAvatarSchema = new Schema<IUserAvatarDocument>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },
        data: {
            type: Buffer,
            required: true
        },
        mimeType: {
            type: String,
            required: true,
            enum: ALLOWED_AVATAR_MIME_TYPES
        },
        size: {
            type: Number,
            required: true
        }
    },
    {
        timestamps: true
    }
)

const UserAvatar = mongoose.model<IUserAvatarDocument>("UserAvatar", userAvatarSchema)
export default UserAvatar
