import { structuredPatch } from "diff"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import type { AiChangeFile } from "@/hooks/apiClients/useAiChangesApi"

const CONTEXT_LINES = 3

type DiffRow = { type: "add" | "remove" | "context"; text: string; oldLine?: number; newLine?: number } | { type: "gap"; hidden: number }

const countLines = (content: string): number => {
    if (!content) return 0
    const lines = content.split("\n").length
    return content.endsWith("\n") ? lines - 1 : lines
}

/** Unified diff rows with line numbers; the unchanged regions between hunks collapse into a single "N lines hidden" row. */
const buildRows = (original: string, proposed: string): DiffRow[] => {
    const patch = structuredPatch("a", "b", original, proposed, undefined, undefined, { context: CONTEXT_LINES })
    const rows: DiffRow[] = []
    let nextOldLine = 1

    for (const hunk of patch.hunks) {
        // With context lines, a hunk has no old lines only when the original is empty (a created file):
        // its oldStart is not a real line then, and there is nothing before it to hide.
        const hunkOldStart = hunk.oldLines === 0 ? nextOldLine : hunk.oldStart
        if (hunkOldStart > nextOldLine) rows.push({ type: "gap", hidden: hunkOldStart - nextOldLine })

        let oldLine = hunkOldStart
        let newLine = hunk.newStart
        for (const line of hunk.lines) {
            const marker = line[0]
            const text = line.slice(1)
            if (marker === "+") rows.push({ type: "add", text, newLine: newLine++ })
            else if (marker === "-") rows.push({ type: "remove", text, oldLine: oldLine++ })
            else if (marker === " ") rows.push({ type: "context", text, oldLine: oldLine++, newLine: newLine++ })
            // "\ No newline at end of file" carries no content worth showing.
        }
        nextOldLine = oldLine
    }

    const totalOld = countLines(original)
    if (patch.hunks.length > 0 && totalOld >= nextOldLine) rows.push({ type: "gap", hidden: totalOld - nextOldLine + 1 })
    return rows
}

const ROW_CLASSES: Record<"add" | "remove" | "context", string> = {
    add: "bg-green-500/10 text-green-800 dark:text-green-300",
    remove: "bg-destructive/10 text-destructive",
    context: "text-foreground"
}

const MARKERS: Record<"add" | "remove" | "context", string> = { add: "+", remove: "-", context: " " }

interface AiChangeDiffProps {
    file: AiChangeFile
}

export const AiChangeDiff: React.FC<AiChangeDiffProps> = ({ file }) => {
    const { t } = useTranslation()

    const original = file.action === "create" ? "" : file.originalContent
    const proposed = file.action === "delete" ? "" : file.proposedContent
    const available = original !== undefined && proposed !== undefined

    const rows = useMemo(() => (available ? buildRows(original, proposed) : []), [available, original, proposed])

    if (!available) {
        return <p className="px-3 py-2 text-sm text-muted-foreground">{t("microfrontend.aiChange.diff.too_big")}</p>
    }

    if (rows.length === 0) {
        return <p className="px-3 py-2 text-sm text-muted-foreground">{t("microfrontend.aiChange.diff.no_differences")}</p>
    }

    const srLabel = { add: t("microfrontend.aiChange.diff.added_line"), remove: t("microfrontend.aiChange.diff.removed_line"), context: t("microfrontend.aiChange.diff.unchanged_line") }

    return (
        <div className="max-h-[480px] overflow-auto">
            <table className="w-full border-collapse font-mono text-xs leading-5">
                <caption className="sr-only">{t("microfrontend.aiChange.diff.caption", { path: file.path })}</caption>
                <thead className="sr-only">
                    <tr>
                        <th scope="col">{t("microfrontend.aiChange.diff.old_line_number")}</th>
                        <th scope="col">{t("microfrontend.aiChange.diff.new_line_number")}</th>
                        <th scope="col">{t("microfrontend.aiChange.diff.content")}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) =>
                        row.type === "gap" ? (
                            <tr key={index} className="bg-muted/50 text-muted-foreground">
                                <td colSpan={3} className="px-3 py-1 text-center italic">
                                    {t("microfrontend.aiChange.diff.hidden_lines", { count: row.hidden })}
                                </td>
                            </tr>
                        ) : (
                            <tr key={index} className={ROW_CLASSES[row.type]}>
                                <td className="w-12 select-none border-r border-divider px-2 text-right align-top text-muted-foreground">{row.oldLine ?? ""}</td>
                                <td className="w-12 select-none border-r border-divider px-2 text-right align-top text-muted-foreground">{row.newLine ?? ""}</td>
                                <td className="whitespace-pre-wrap break-all px-2 align-top">
                                    <span className="sr-only">{srLabel[row.type]}: </span>
                                    <span aria-hidden="true" className="select-none pr-2">
                                        {MARKERS[row.type]}
                                    </span>
                                    {row.text}
                                </td>
                            </tr>
                        )
                    )}
                </tbody>
            </table>
        </div>
    )
}

export default AiChangeDiff
