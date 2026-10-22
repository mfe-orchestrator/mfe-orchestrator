import mongoose, { Schema } from "mongoose"
import { AssistantConversationMessageDTO } from "../types/AssistantDTO"

/**
 * A conversation with the console assistant, kept so that the user can reopen it. The id comes
 * from the browser, which names the conversation before its first answer is saved.
 *
 * Conversations are never removed from the database: deleting one only sets `deletedAt`, and
 * there is no expiry.
 */
export interface IAssistantConversation {
    _id: string
    userId: Schema.Types.ObjectId
    projectId: Schema.Types.ObjectId
    /** The first question, shortened: what the history lists. */
    title: string
    /** As the panel shows them, without tool inputs and results (see `conversations.ts`). */
    messages: AssistantConversationMessageDTO[]
    /** Set when the user deletes it: it leaves the history but stays in the database. */
    deletedAt?: Date
    createdAt: Date
    updatedAt: Date
}

const assistantConversationSchema = new Schema<IAssistantConversation>(
    {
        _id: { type: String, required: true },
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
        title: { type: String, required: true },
        messages: { type: Schema.Types.Mixed, required: true },
        deletedAt: { type: Date }
    },
    { timestamps: true }
)

assistantConversationSchema.index({ userId: 1, projectId: 1, updatedAt: -1 })

const AssistantConversation = mongoose.model<IAssistantConversation>("AssistantConversation", assistantConversationSchema)
export default AssistantConversation
