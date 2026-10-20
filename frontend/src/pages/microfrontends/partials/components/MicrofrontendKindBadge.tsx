import { Container, LayoutDashboard } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { type Microfrontend, MicrofrontendKind } from "@/hooks/apiClients/useMicrofrontendsApi"
import { cn } from "@/utils/styleUtils"
import { KIND_BADGE_KEYS, KIND_DESCRIPTION_KEYS } from "../labels"

/** Who serves it, at a glance: MFE Orchestrator, or its own Docker container. */
export const MicrofrontendKindBadge: React.FC<{ microfrontend: Microfrontend; className?: string }> = ({ microfrontend, className }) => {
    const { t } = useTranslation()
    const kind = microfrontend.kind ?? MicrofrontendKind.MICROFRONTEND
    const Icon = kind === MicrofrontendKind.FRONTEND ? Container : LayoutDashboard

    return (
        <Badge variant="outline" className={cn("gap-1", className)} title={t(KIND_DESCRIPTION_KEYS[kind])}>
            <Icon className="size-3 shrink-0" aria-hidden="true" />
            {t(KIND_BADGE_KEYS[kind])}
        </Badge>
    )
}

export default MicrofrontendKindBadge
