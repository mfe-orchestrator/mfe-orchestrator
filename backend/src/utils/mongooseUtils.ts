import { isValidObjectId, ObjectId, Schema } from "mongoose"
import { createBusinessException } from "../errors/BusinessException"

export function toObjectId(id: string | ObjectId | Schema.Types.ObjectId): Schema.Types.ObjectId {
    if (isValidObjectId(id)) {
        return id as unknown as Schema.Types.ObjectId
    }
    throw createBusinessException({
        code: "INVALID_OBJECT_ID",
        message: `Invalid identifier: ${typeof id === "string" ? id : JSON.stringify(id)}`,
        statusCode: 400
    })
}
