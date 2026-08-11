import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { DependencyUpdateStatus } from "@/hooks/apiClients/useDependenciesApi"

const VARIANT_BY_STATUS: Record<DependencyUpdateStatus, "default" | "accent" | "destructive" | "outline"> = {
    [DependencyUpdateStatus.UP_TO_DATE]: "default",
    [DependencyUpdateStatus.PATCH_BEHIND]: "outline",
    [DependencyUpdateStatus.MINOR_BEHIND]: "accent",
    [DependencyUpdateStatus.MAJOR_BEHIND]: "destructive",
    [DependencyUpdateStatus.UNKNOWN]: "outline"
}

export interface DependencyStatusBadgeProps {
    status: DependencyUpdateStatus
}

export const DependencyStatusBadge: React.FC<DependencyStatusBadgeProps> = ({ status }) => {
    const { t } = useTranslation()

    return <Badge variant={VARIANT_BY_STATUS[status]}>{t(`dependencies.status.${status}`)}</Badge>
}

export default DependencyStatusBadge
