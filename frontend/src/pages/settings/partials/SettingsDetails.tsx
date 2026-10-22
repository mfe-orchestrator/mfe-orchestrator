import { ChevronRight } from "lucide-react"
import { ReactNode } from "react"

interface SettingsDetailsProps {
    summary: string
    children: ReactNode
    dataTestId?: string
}

/** Quello che serve solo a chi lo cerca: le spiegazioni lunghe e i campi che quasi nessuno cambia restano chiusi */
export const SettingsDetails: React.FC<SettingsDetailsProps> = ({ summary, children, dataTestId }) => (
    <details className="group text-sm" data-testid={dataTestId}>
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-foreground-secondary hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
            {summary}
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-muted-foreground">{children}</div>
    </details>
)

export default SettingsDetails
