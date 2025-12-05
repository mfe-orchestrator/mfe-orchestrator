import { ObjectId, Schema } from "mongoose"

export function toObjectId(id: string | ObjectId | Schema.Types.ObjectId): ObjectId {
    return typeof id === "string" ? new Schema.Types.ObjectId(id) : id
}
