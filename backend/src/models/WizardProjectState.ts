import mongoose, { Document, ObjectId, Schema } from "mongoose"

export interface IWizardProjectState extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId

    /**
     * Stato corrente XState
     * es: "step1" | "step2" | ...
     */
    stateValue: string

    /**
     * Context XState serializzato
     */
    context: Record<string, any>

    /**
     * Versione della macchina (utile se la FSM evolve)
     */
    machineVersion: number
    /**
     * Timestamp
     */
    createdAt: Date
    updatedAt: Date
}

const WizardProjectStateSchema = new Schema<IWizardProjectState>(
    {
        projectId: {
            type: Schema.Types.ObjectId,
            ref: "Project",
            required: true,
            index: true,
            unique: true
        },

        stateValue: {
            type: String,
            required: true
        },

        context: {
            type: Schema.Types.Mixed,
            required: true,
            default: {}
        },

        machineVersion: {
            type: Number,
            required: true,
            default: 1
        }
    },
    {
        timestamps: true,
        versionKey: false
    }
)

WizardProjectStateSchema.index({ projectId: 1 }, { unique: true })

const WizardProjectState = mongoose.model<IWizardProjectState>("WizardProjectState", WizardProjectStateSchema)
export default WizardProjectState
