import type { ReactNode } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkBreaks from "remark-breaks"
import remarkGfm from "remark-gfm"
import { cn } from "@/utils/styleUtils"

/**
 * Hosts whose links are rendered clickable: the documentation, the CI providers and the console
 * itself. The text comes from the model, which also reads user-written names and CI logs, so a
 * link anywhere else is shown as plain text rather than as something to click.
 */
const TRUSTED_HOSTS = ["mfe-orchestrator.dev", "github.com", "gitlab.com", "dev.azure.com", "visualstudio.com"]

const isTrusted = (href: string) => {
    try {
        const { hostname } = new URL(href)
        return hostname === window.location.hostname || TRUSTED_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))
    } catch {
        return false
    }
}

const Link: React.FC<{ href: string; children: ReactNode }> = ({ href, children }) =>
    isTrusted(href) ? (
        <a href={href} target="_blank" rel="noreferrer noopener" className="underline break-all">
            {children}
        </a>
    ) : (
        <span className="break-all">
            {children}
            {href && children !== href && ` (${href})`}
        </span>
    )

const Heading: React.FC<{ children?: ReactNode }> = ({ children }) => <p className="font-semibold">{children}</p>

const COMPONENTS: Components = {
    a: ({ href, children }) => <Link href={href ?? ""}>{children}</Link>,
    // An image is fetched as soon as it renders, sending the request to whatever URL the model wrote: shown as a link instead.
    img: ({ src, alt }) => <Link href={typeof src === "string" ? src : ""}>{alt || src}</Link>,
    // Headings as bold lines: an answer sits inside the page, not above its own title.
    h1: Heading,
    h2: Heading,
    h3: Heading,
    h4: Heading,
    h5: Heading,
    h6: Heading,
    ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
    ol: ({ start, children }) => (
        <ol start={start} className="list-decimal space-y-1 pl-5">
            {children}
        </ol>
    ),
    code: ({ children }) => <code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
    pre: ({ children }) => <pre className="overflow-x-auto rounded bg-foreground/10 p-2 [&>code]:bg-transparent [&>code]:p-0">{children}</pre>,
    blockquote: ({ children }) => <blockquote className="border-l-2 border-divider pl-3 text-foreground-secondary">{children}</blockquote>,
    table: ({ children }) => (
        <div className="overflow-x-auto">
            <table className="border-collapse">{children}</table>
        </div>
    ),
    th: ({ children }) => <th className="border border-divider px-2 py-1 text-left font-semibold">{children}</th>,
    td: ({ children }) => <td className="border border-divider px-2 py-1 align-top">{children}</td>,
    hr: () => <hr className="border-divider" />
}

/**
 * The text of a message or of a summary, rendered as Markdown with line breaks kept: summaries
 * become pull request descriptions, so the agent writes them for a Markdown renderer.
 *
 * react-markdown builds React elements and leaves raw HTML out: the text is model output and
 * never reaches the DOM as HTML.
 */
const AssistantMessageText: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
    <div className={cn("flex flex-col gap-2 break-words", className)}>
        <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={COMPONENTS}>
            {text}
        </Markdown>
    </div>
)

export default AssistantMessageText
