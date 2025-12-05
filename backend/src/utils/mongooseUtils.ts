import { isValidObjectId, ObjectId, Schema } from "mongoose"

export function toObjectId(id: string | ObjectId | Schema.Types.ObjectId): Schema.Types.ObjectId {
    //return typeof id === "string" ? new Types.ObjectId(id) : id
    if (isValidObjectId(id)) {
        return id as unknown as Schema.Types.ObjectId
    }
    return new Schema.Types.ObjectId(id as unknown as string)
}
