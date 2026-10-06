import { Fragment } from "react"

/** Markdown links, bare links, `code` and **bold**: the only formatting the assistant is asked to use. */
const TOKEN = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>]+|`[^`\n]+`|\*\*[^*\n]+\*\*)/g
const MARKDOWN_LINK = /^\[([^\]]+)\]\((.+)\)$/
/** A sentence ending right after a link is not part of the URL. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/

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

const renderLink = (label: string, href: string, key: number) =>
    isTrusted(href) ? (
        <a key={key} href={href} target="_blank" rel="noreferrer noopener" className="underline break-all">
            {label}
        </a>
    ) : (
        <span key={key} className="break-all">
            {label === href ? href : `${label} (${href})`}
        </span>
    )

const renderToken = (token: string, key: number) => {
    const markdownLink = token.match(MARKDOWN_LINK)
    if (markdownLink) {
        return renderLink(markdownLink[1], markdownLink[2], key)
    }
    if (token.startsWith("http")) {
        const trailing = token.match(TRAILING_PUNCTUATION)?.[0] ?? ""
        const href = trailing ? token.slice(0, -trailing.length) : token
        return (
            <Fragment key={key}>
                {renderLink(href, href, key)}
                {trailing}
            </Fragment>
        )
    }
    if (token.startsWith("`")) {
        return (
            <code key={key} className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">
                {token.slice(1, -1)}
            </code>
        )
    }
    if (token.startsWith("**")) {
        return <strong key={key}>{token.slice(2, -2)}</strong>
    }
    return <Fragment key={key}>{token}</Fragment>
}

/**
 * The text of an answer, with line breaks kept.
 *
 * Rendered as React nodes rather than through a markdown library: the answer is model output
 * and never reaches the DOM as HTML.
 */
const AssistantMessageText: React.FC<{ text: string }> = ({ text }) => <p className="whitespace-pre-wrap break-words">{text.split(TOKEN).map(renderToken)}</p>

export default AssistantMessageText
