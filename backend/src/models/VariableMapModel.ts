import mongoose, { Document, Model, ObjectId, Schema } from "mongoose"
import { SERVICE_VARIABLE_KEY } from "../types/ServiceStack"
import { VARIABLE_MAP_NAME, VariableMapKind } from "../types/VariableMapDTO"
import { encryptedFields } from "../utils/encryptedFieldsPlugin"
import { SECRET_PLACEHOLDER } from "../utils/secretCrypto"

/** The value a key takes in one environment of the project */
export interface IVariableMapValue {
    environmentId: Schema.Types.ObjectId
    value: string
}

/** A key of the map: an environment with no value leaves it unset there */
export interface IVariableMapEntry {
    key: string
    values: IVariableMapValue[]
}

/**
 * Values a backend service receives as environment variables, one per environment of the project. A
 * map belongs to the project, not to a service: services attach it by id, and many can share one.
 */
export interface IVariableMap extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId
    name: string
    description?: string
    entries: IVariableMapEntry[]
    createdAt: Date
    updatedAt: Date
}

/** Encrypted at rest; every answer of the API carries the placeholder in their place */
export const SECRET_ENCRYPTED_PATHS = ["entries.values.value"]

// No length limit here: on an update the validators see the ciphertext of a secret, not what was typed.
// VariableMapService bounds the values before they get this far.
const variableMapValueSchema = new Schema<IVariableMapValue>(
    {
        environmentId: {
            type: Schema.Types.ObjectId,
            ref: "Environment",
            required: true
        },
        value: {
            type: String,
            required: true
        }
    },
    { _id: false }
)

const variableMapEntrySchema = new Schema<IVariableMapEntry>(
    {
        key: {
            type: String,
            required: true,
            trim: true,
            match: SERVICE_VARIABLE_KEY
        },
        values: {
            type: [variableMapValueSchema],
            default: []
        }
    },
    { _id: false }
)

/** Config maps and secrets have the same shape; they only differ in how their values are kept */
const variableMapSchema = () => {
    const schema = new Schema<IVariableMap>(
        {
            projectId: {
                type: Schema.Types.ObjectId,
                ref: "Project",
                required: true
            },
            name: {
                type: String,
                required: true,
                trim: true,
                lowercase: true,
                match: VARIABLE_MAP_NAME
            },
            description: {
                type: String,
                trim: true
            },
            entries: {
                type: [variableMapEntrySchema],
                default: []
            }
        },
        {
            timestamps: true
        }
    )
    schema.index({ name: 1, projectId: 1 }, { unique: true })
    return schema
}

const secretSchema = variableMapSchema()

secretSchema.plugin(encryptedFields, { model: "Secret", paths: SECRET_ENCRYPTED_PATHS })

/**
 * Every way out of the backend serialises a secret through here, so this is where the values are hidden.
 * The placeholder rather than nothing: the form submits it back untouched, and VariableMapService reads
 * that as "keep the stored value".
 */
secretSchema.set("toJSON", {
    transform: (_document, object) => {
        for (const entry of (object.entries ?? []) as IVariableMapEntry[]) {
            for (const value of entry.values ?? []) {
                value.value = SECRET_PLACEHOLDER
            }
        }
        return object
    }
})

export const ConfigMap = mongoose.model<IVariableMap>("ConfigMap", variableMapSchema())
export const Secret = mongoose.model<IVariableMap>("Secret", secretSchema)

export const variableMapModels: Record<VariableMapKind, Model<IVariableMap>> = { configMap: ConfigMap, secret: Secret }
