import mongoose, { Document, ObjectId, Schema } from "mongoose"
import { WIZARD_MACHINE_VERSION, WizardStep } from "../utils/projectWizardStateMachine"

export enum WizardStatus {
    IN_PROGRESS = "IN_PROGRESS",
    COMPLETED = "COMPLETED"
}

export interface IWizardProjectState extends Document<ObjectId> {
    projectId: Schema.Types.ObjectId

    /**
     * Stato corrente XState
     * es: "step1" | "step2" | ...
     */
    stateValue: WizardStep

    /**
     * Context XState serializzato
     */
    // biome-ignore lint/suspicious/noExplicitAny: the xstate context is free form by design
    context: Record<string, any>

    /**
     * Steps the user already went through. Drives the stepper and tells which
     * steps can be re-opened without breaking the machine order.
     */
    completedSteps: WizardStep[]

    /**
     * While the wizard is IN_PROGRESS the project is locked: it cannot be used
     * from the console, only configured through the wizard endpoints.
     */
    status: WizardStatus

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
            enum: Object.values(WizardStep),
            required: true
        },

        context: {
            type: Schema.Types.Mixed,
            required: true,
            default: {}
        },

        completedSteps: {
            type: [String],
            enum: Object.values(WizardStep),
            required: true,
            default: []
        },

        status: {
            type: String,
            enum: Object.values(WizardStatus),
            required: true,
            default: WizardStatus.IN_PROGRESS,
            index: true
        },

        machineVersion: {
            type: Number,
            required: true,
            default: WIZARD_MACHINE_VERSION
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
