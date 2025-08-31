import { model, Schema, ObjectId, Document } from "mongoose"
import { IGlobalVariable } from "./GlobalVariableModel"
import { IMicrofrontend } from "./MicrofrontendModel"

export interface IDeployment extends Document<ObjectId> {
    environmentId: ObjectId
    variables?: IGlobalVariable[]
    microfrontends?: IMicrofrontend[]
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
deploymentSchema.index({ environmentId: 1, deploymentId: 1 }, { unique: true });

const Deployment = model<IDeployment>("Deployment", deploymentSchema)
export default Deployment
