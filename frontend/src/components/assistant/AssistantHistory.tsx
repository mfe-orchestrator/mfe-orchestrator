import { Spinner } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useAssistantApi, { AssistantConversation, AssistantConversationSummary } from "@/hooks/apiClients/useAssistantApi"
import useAssistantJobsStore from "@/store/useAssistantJobsStore"
import useAssistantStore, { AssistantMessage } from "@/store/useAssistantStore"

/**
 * The server keeps no tool inputs (toStored drops them): the panel's types expect them, empty. A card
 * still pending past its expiry can no longer be answered: left pending, it would lock the input.
 */
const toPanelMessages = (conversation: AssistantConversation): AssistantMessage[] => {
    const now = Date.now()
    const expiredCalls = new Set(
        conversation.messages.filter(message => message.confirmation?.status === "pending" && new Date(message.confirmation.expiresAt).getTime() <= now).map(message => message.confirmation?.callId)
    )
    return conversation.messages.map(message => ({
        ...message,
        tools: message.tools?.map(tool => ({
            ...tool,
            input: tool.input ?? {},
            status: tool.status === "awaiting_confirmation" && expiredCalls.has(tool.id) ? "interrupted" : tool.status
        })),
        confirmation: message.confirmation && {
            ...message.confirmation,
            input: message.confirmation.input ?? {},
            status: message.confirmation.status === "pending" && expiredCalls.has(message.confirmation.callId) ? "expired" : message.confirmation.status
        }
    }))
}

interface AssistantHistoryProps {
    projectId: string
    /** Runs once a conversation is shown, so the panel goes back to it. */
    onOpened?: () => void
}

/**
 * The user's saved conversations on the project, the most recent first: one click reopens it. In
 * place of the conversation in the panel, next to it on the assistant page.
 */
const AssistantHistory: React.FC<AssistantHistoryProps> = ({ projectId, onOpened }) => {
    const { t, i18n } = useTranslation()
    const assistantApi = useAssistantApi()
    const queryClient = useQueryClient()
    const currentId = useAssistantStore(state => state.conversationId)
    // Shown next to the conversation, the list stays usable while an answer streams: it must not swap or drop that conversation.
    const isStreaming = useAssistantStore(state => state.messages.some(message => message.status === "streaming"))
    const [openingId, setOpeningId] = useState<string>()
    const [deleting, setDeleting] = useState<AssistantConversationSummary>()

    const {
        data: conversations,
        isLoading,
        isError
    } = useQuery({
        queryKey: ["assistant-conversations", projectId],
        queryFn: () => assistantApi.listConversations()
    })

    const deleteMutation = useMutation({
        mutationFn: (id: string) => assistantApi.deleteConversation(id),
        onSuccess: (_, id) => {
            // Its next answer would save it again.
            if (id === useAssistantStore.getState().conversationId) useAssistantStore.getState().reset()
            queryClient.invalidateQueries({ queryKey: ["assistant-conversations"] })
        }
    })

    // A job tab may be in front: the conversation has to show.
    const shown = () => {
        useAssistantJobsStore.getState().setActiveTab(projectId, "project")
        onOpened?.()
    }

    const open = async (id: string) => {
        if (id === currentId) {
            shown()
            return
        }
        setOpeningId(id)
        try {
            const conversation = await assistantApi.getConversation(id)
            if (useAssistantStore.getState().openConversation(projectId, conversation.id, toPanelMessages(conversation))) shown()
        } catch (error) {
            // The API client already shows the error: the list stays open.
            console.error("Could not open the conversation", error)
        } finally {
            setOpeningId(undefined)
        }
    }

    const formatDate = (value: string) => new Date(value).toLocaleString(i18n.language, { dateStyle: "short", timeStyle: "short" })

    return (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" data-testid="assistant-history">
            <p className="font-medium text-foreground">{t("assistant.history.title")}</p>
            {isLoading ? (
                <Spinner size={20} centerScreen={false} />
            ) : isError ? (
                <p className="text-sm text-destructive">{t("assistant.history.error")}</p>
            ) : !conversations?.length ? (
                <p className="text-sm text-foreground-secondary">{t("assistant.history.empty")}</p>
            ) : (
                <ul className="flex flex-col gap-1">
                    {conversations.map(conversation => (
                        <li key={conversation.id} className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={Boolean(openingId) || isStreaming}
                                onClick={() => open(conversation.id)}
                                className="flex min-w-0 flex-1 flex-col rounded-md px-3 py-2 text-left hover:bg-primary/5 disabled:opacity-60"
                            >
                                <span className="truncate text-sm text-foreground">{conversation.title}</span>
                                <span className="text-xs text-foreground-secondary">{conversation.id === currentId ? t("assistant.history.current") : formatDate(conversation.updatedAt)}</span>
                            </button>
                            {openingId === conversation.id ? (
                                <Spinner size={16} centerScreen={false} />
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t("assistant.history.delete")}
                                    title={t("assistant.history.delete")}
                                    disabled={isStreaming}
                                    onClick={() => setDeleting(conversation)}
                                >
                                    <Trash2 />
                                </Button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            <DeleteConfirmationDialog
                isOpen={Boolean(deleting)}
                onOpenChange={isOpen => !isOpen && setDeleting(undefined)}
                title={t("assistant.history.delete_title")}
                description={t("assistant.history.delete_description", { title: deleting?.title ?? "" })}
                deleteLabel={t("assistant.history.delete")}
                deletingLabel={t("assistant.history.deleting")}
                // The API client already shows the error: the dialog closes either way.
                onDelete={() =>
                    deleting
                        ? deleteMutation.mutateAsync(deleting.id).then(
                              () => setDeleting(undefined),
                              () => setDeleting(undefined)
                          )
                        : Promise.resolve()
                }
            />
        </div>
    )
}

export default AssistantHistory
