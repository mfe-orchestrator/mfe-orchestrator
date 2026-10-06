import { Textarea } from "@mfe-orchestrator/design-system"
import { ArrowUp, RotateCcw, Sparkles, Square, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"
import { Button } from "@/components/atoms"
import useAssistantChat from "@/hooks/useAssistantChat"
import useAssistantStore, { AssistantMessage } from "@/store/useAssistantStore"
import useProjectStore from "@/store/useProjectStore"
import AssistantMessageText from "./AssistantMessageText"
import useAssistantEnabled from "./useAssistantEnabled"

const MAX_QUESTION_CHARS = 4_000

/** Starter questions, page-specific first: they show what the assistant can look up from here. */
const SUGGESTIONS_BY_PAGE: Record<string, string[]> = {
    "/builds": ["builds"],
    "/deployments": ["deployments"],
    "/dependencies": ["dependencies"],
    "/environment-variables": ["variables"]
}
const GENERIC_SUGGESTIONS = ["overview", "canary", "storage"]

const suggestionsFor = (pathname: string) => {
    const pageKey = Object.keys(SUGGESTIONS_BY_PAGE).find(prefix => pathname.startsWith(prefix))
    return [...(pageKey ? SUGGESTIONS_BY_PAGE[pageKey] : []), ...GENERIC_SUGGESTIONS].slice(0, 3)
}

const AnswerBubble: React.FC<{ message: AssistantMessage }> = ({ message }) => {
    const { t } = useTranslation()
    const lastTool = message.tools?.[message.tools.length - 1]

    return (
        <div className="flex flex-col gap-1 text-sm text-foreground">
            {message.content && <AssistantMessageText text={message.content} />}
            {message.status === "streaming" && (
                <p className="text-foreground-secondary animate-pulse">
                    {lastTool ? t("assistant.looking_up", { what: t(`assistant.tools.${lastTool}`, { defaultValue: lastTool }) }) : t("assistant.thinking")}
                </p>
            )}
            {message.errorKey && <p className={message.status === "error" ? "text-destructive" : "text-foreground-secondary"}>{t(`assistant.errors.${message.errorKey}`)}</p>}
        </div>
    )
}

/**
 * The assistant, docked on the right of every project page.
 *
 * On wide screens it takes a column next to the content, so the page the user is asking
 * about stays visible; on small screens it covers the page. ⌘J / Ctrl+J toggles it.
 */
const AssistantPanel: React.FC = () => {
    const { t } = useTranslation()
    const enabled = useAssistantEnabled()
    const location = useLocation()
    const { isOpen, messages, close, toggle, reset } = useAssistantStore()
    const pendingQuestion = useAssistantStore(state => state.pendingQuestion)
    const projectId = useProjectStore(state => state.project?._id)
    const { send, stop, isStreaming } = useAssistantChat()
    const [draft, setDraft] = useState("")
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (!enabled) return
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
                event.preventDefault()
                toggle()
            }
        }
        window.addEventListener("keydown", onKeyDown)
        return () => window.removeEventListener("keydown", onKeyDown)
    }, [enabled, toggle])

    // A conversation is about one project: switching project starts a new one.
    // biome-ignore lint/correctness/useExhaustiveDependencies: only a project change must reset the conversation.
    useEffect(() => {
        stop()
        reset()
    }, [projectId])

    // biome-ignore lint/correctness/useExhaustiveDependencies: send is recreated every render; the pending question is what triggers this.
    useEffect(() => {
        if (!pendingQuestion || isStreaming) return
        const question = useAssistantStore.getState().takePendingQuestion()
        if (question) send(question)
    }, [pendingQuestion, isStreaming])

    useEffect(() => {
        if (isOpen) inputRef.current?.focus()
    }, [isOpen])

    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on every change of the conversation, streamed text included.
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }, [messages])

    if (!enabled || !isOpen) return null

    const submit = () => {
        if (!draft.trim() || isStreaming) return
        send(draft)
        setDraft("")
    }

    return (
        <aside
            aria-label={t("assistant.title")}
            data-testid="assistant-panel"
            className="fixed inset-0 z-40 flex flex-col bg-background md:static md:inset-auto md:z-auto md:h-full md:w-[380px] md:shrink-0 md:border-l md:border-divider"
        >
            <header className="flex items-center gap-2 border-b border-divider px-4 py-3">
                <Sparkles className="size-5 text-primary" aria-hidden="true" />
                <h2 className="flex-1 font-semibold text-foreground">{t("assistant.title")}</h2>
                {messages.length > 0 && (
                    <Button variant="ghost" size="icon" aria-label={t("assistant.new_conversation")} onClick={reset} disabled={isStreaming} dataTestId="assistant-reset">
                        <RotateCcw />
                    </Button>
                )}
                <Button variant="ghost" size="icon" aria-label={t("assistant.close")} onClick={close} dataTestId="assistant-close">
                    <X />
                </Button>
            </header>

            <div ref={scrollRef} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                    <div className="flex flex-col gap-3">
                        <p className="font-medium text-foreground">{t("assistant.empty_title")}</p>
                        <p className="text-sm text-foreground-secondary">{t("assistant.empty_description")}</p>
                        <div className="flex flex-col gap-2">
                            {suggestionsFor(location.pathname).map(key => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => send(t(`assistant.suggestions.${key}`))}
                                    className="rounded-md border border-divider px-3 py-2 text-left text-sm text-foreground hover:bg-primary/5"
                                >
                                    {t(`assistant.suggestions.${key}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map(message =>
                        message.role === "user" ? (
                            <div key={message.id} className="self-end max-w-[85%] rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">
                                <AssistantMessageText text={message.content} />
                            </div>
                        ) : (
                            <AnswerBubble key={message.id} message={message} />
                        )
                    )
                )}
            </div>

            <form
                className="flex flex-col gap-2 border-t border-divider px-4 py-3"
                onSubmit={event => {
                    event.preventDefault()
                    submit()
                }}
            >
                <div className="flex items-end gap-2">
                    <Textarea
                        ref={inputRef}
                        value={draft}
                        maxLength={MAX_QUESTION_CHARS}
                        rows={2}
                        className="min-h-[44px] resize-none"
                        placeholder={t("assistant.placeholder")}
                        aria-label={t("assistant.placeholder")}
                        dataTestId="assistant-input"
                        onChange={event => setDraft(event.target.value)}
                        onKeyDown={event => {
                            // Enter sends, Shift+Enter goes to a new line, as in any chat.
                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                event.preventDefault()
                                submit()
                            }
                        }}
                    />
                    {isStreaming ? (
                        <Button type="button" variant="secondary" size="icon" aria-label={t("assistant.stop")} onClick={stop} dataTestId="assistant-stop">
                            <Square />
                        </Button>
                    ) : (
                        <Button type="submit" size="icon" aria-label={t("assistant.send")} disabled={!draft.trim()} dataTestId="assistant-send">
                            <ArrowUp />
                        </Button>
                    )}
                </div>
                <p className="text-xs text-foreground-secondary">{t("assistant.disclaimer")}</p>
            </form>
        </aside>
    )
}

export default AssistantPanel
