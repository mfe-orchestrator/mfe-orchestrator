import { Ban, CheckCircle2, CircleDashed, CircleHelp, Loader2, XCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { BuildStatus } from "@/hooks/apiClients/useBuildsApi"
import { cn } from "@/utils/styleUtils"

/**
 * The design system offers four badge variants and there are six statuses, so the
 * icon carries the distinction the colour cannot: "queued", "canceled" and
 * "unknown" all render as outline and are told apart by their glyph.
 */
const STATUS_VARIANTS: Record<BuildStatus, "default" | "accent" | "destructive" | "outline"> = {
    [BuildStatus.SUCCESS]: "default",
    [BuildStatus.RUNNING]: "accent",
    [BuildStatus.FAILED]: "destructive",
    [BuildStatus.QUEUED]: "outline",
    [BuildStatus.CANCELED]: "outline",
    [BuildStatus.UNKNOWN]: "outline"
}

const STATUS_ICONS: Record<BuildStatus, React.ComponentType<{ className?: string }>> = {
    [BuildStatus.SUCCESS]: CheckCircle2,
    [BuildStatus.RUNNING]: Loader2,
    [BuildStatus.FAILED]: XCircle,
    [BuildStatus.QUEUED]: CircleDashed,
    [BuildStatus.CANCELED]: Ban,
    [BuildStatus.UNKNOWN]: CircleHelp
}

interface BuildStatusBadgeProps {
    status: BuildStatus
}

const BuildStatusBadge: React.FC<BuildStatusBadgeProps> = ({ status }) => {
    const { t } = useTranslation()
    const Icon = STATUS_ICONS[status] ?? CircleHelp

    return (
        <Badge variant={STATUS_VARIANTS[status] ?? "outline"}>
            <Icon className={cn("size-3.5 shrink-0", status === BuildStatus.RUNNING && "animate-spin")} />
            <span>{t(`builds.status.${status}`)}</span>
        </Badge>
    )
}

export default BuildStatusBadge
