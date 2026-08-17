import { Document, model, ObjectId, Schema } from "mongoose"
import { encryptedFields } from "../utils/encryptedFieldsPlugin"
import { IGlobalVariable } from "./GlobalVariableModel"
import { IMicrofrontend } from "./MicrofrontendModel"
import { IStorage, STORAGE_SECRET_PATHS } from "./StorageModel"

export interface IDeployment extends Document<ObjectId> {
    environmentId: ObjectId
    variables?: IGlobalVariable[]
    microfrontends?: IMicrofrontend[]
    storages?: IStorage[]
    deploymentId: string
    active: boolean
    deployedAt: Date
}

const deploymentSchema = new Schema<IDeployment>(
    {
        environmentId: {
            type: Schema.Types.ObjectId,
            required: true,
            trim: true
        },
        deploymentId: {
            type: String,
            required: true,
            trim: true
        },
        variables: {
            type: Array,
            required: false
        },
        microfrontends: {
            type: Array,
            required: false
        },
        storages: {
            type: Array,
            required: false
        },
        active: {
            type: Boolean,
            required: true,
            default: false
        },
        deployedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
)

// Aggiungo un indice composto per garantire l'unicità della coppia environmentId e deploymentId
deploymentSchema.index({ environmentId: 1, deploymentId: 1 }, { unique: true })

/**
 * A deployment freezes a copy of the storages of the project, credentials included, and the serve API
 * reads the bucket keys from that copy rather than from the storage itself. Encrypting the storage
 * collection alone would therefore leave every key of every past deployment in the clear right next
 * to it.
 */
deploymentSchema.plugin(encryptedFields, {
    model: "Deployment",
    paths: STORAGE_SECRET_PATHS.map(path => `storages.${path}`)
})

const Deployment = model<IDeployment>("Deployment", deploymentSchema)
export default Deployment
