import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import type { Service } from "@/hooks/apiClients/useServicesApi"
import { RUNTIME_LABEL_KEYS } from "./labels"

export const RuntimeBadge: React.FC<{ service: Service }> = ({ service }) => {
    const { t } = useTranslation()
    const runtime = service.stack?.runtime
    if (!runtime) return null
    return <Badge variant="outline">{t(RUNTIME_LABEL_KEYS[runtime] ?? RUNTIME_LABEL_KEYS.OTHER)}</Badge>
}

export default RuntimeBadge
