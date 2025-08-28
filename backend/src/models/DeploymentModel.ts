import { model, Schema, ObjectId, Document } from "mongoose"
import { IGlobalVariable } from "./GlobalVariableModel"
import { IMicrofrontend } from "./MicrofrontendModel"

export interface IDeployment extends Document<ObjectId> {
    environmentId: ObjectId
    variables?: IGlobalVariable[]
    microfrontends?: IMicrofrontend[]
}

const deploymentSchema = new Schema<IDeployment>(
    {
        environmentId: {
            type: Schema.Types.ObjectId,
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
        }
    },
    {
        timestamps: true
    }
)

const Deployment = model<IDeployment>("Deployment", deploymentSchema)
export default Deployment
