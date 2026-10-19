import mongoose, { Document, ObjectId, Schema } from "mongoose"

export const SERVICE_DEPLOYMENT_IMAGE_MAX_LENGTH = 512
export const SERVICE_DEPLOYMENT_COMMIT_SHA_MAX_LENGTH = 64

/**
 * A version of a service the deploy pipeline of the customer reported as running in an environment.
 * The orchestrator does not deploy services itself: this is what the CD tells it, one document per
 * notification, so the history stays. The version a service runs in an environment is the latest
 * by `deployedAt`.
 */
export interface IServiceDeployment extends Document<ObjectId> {
    serviceId: ObjectId
    environmentId: ObjectId
    version: string
    /** Full reference, e.g. ghcr.io/acme/orders-api:1.2.0 */
    image?: string
    commitSha?: string
    deployedAt: Date
    createdAt: Date
    updatedAt: Date
}

const serviceDeploymentSchema = new Schema<IServiceDeployment>(
    {
        serviceId: {
            type: Schema.Types.ObjectId,
            ref: "Service",
            required: true
        },
        environmentId: {
            type: Schema.Types.ObjectId,
            ref: "Environment",
            required: true
        },
        version: {
            type: String,
            required: true,
            trim: true,
            maxlength: 128
        },
        image: {
            type: String,
            required: false,
            trim: true,
            maxlength: SERVICE_DEPLOYMENT_IMAGE_MAX_LENGTH
        },
        commitSha: {
            type: String,
            required: false,
            trim: true,
            maxlength: SERVICE_DEPLOYMENT_COMMIT_SHA_MAX_LENGTH
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

// The latest deploy of a service in an environment is read first, the most recent insert breaking a tie
serviceDeploymentSchema.index({ serviceId: 1, environmentId: 1, deployedAt: -1, _id: -1 })
// What deleting an environment removes
serviceDeploymentSchema.index({ environmentId: 1 })

const ServiceDeployment = mongoose.model<IServiceDeployment>("ServiceDeployment", serviceDeploymentSchema)
export default ServiceDeployment
