import { Handle, type Node, type NodeProps, Position } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { CanaryType, type Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import CloneRepositoryPopover from "../components/CloneRepositoryPopover"
import { CANARY_DEPLOYMENT_TYPE_LABEL_KEYS, CANARY_TYPE_LABEL_KEYS } from "../labels"

/**
 * The node carries the microfrontend itself and nothing derived from it: every label is translated
 * here, at render time, so switching language does not rebuild the graph — which would throw away
 * the positions dragged in this session, since they are only persisted on drag end.
 */
export interface MicrofrontendNodeData extends Record<string, unknown> {
    microfrontend: Microfrontend
}

export type MicrofrontendFlowNodeType = Node<MicrofrontendNodeData, "microfrontend">

export const MICROFRONTEND_NODE_TYPE = "microfrontend"

/**
 * A handle small enough not to read as content, with a hit area larger than what it draws so it is
 * still comfortable to grab. React Flow gives handles their own stylesheet, hence the overrides.
 */
const HANDLE_CLASS =
    "!h-2 !w-2 !rounded-full !border-2 !border-card !bg-foreground-secondary/60 !transition-colors group-[.is-highlighted]:!bg-primary after:absolute after:-inset-2 after:content-['']"

export const MicrofrontendFlowNode: React.FC<NodeProps<MicrofrontendFlowNodeType>> = ({ data }) => {
    const { t } = useTranslation("platform")
    const { microfrontend } = data
    const canary = microfrontend.canary?.enabled ? microfrontend.canary : undefined

    // A share for the two strategies that split traffic, and who for the one that does not.
    const canaryLabel = canary && (canary.type === CanaryType.ON_USER ? t("microfrontend.canary_enrolled_users") : `${Math.min(100, Math.max(0, canary.percentage ?? 0))}%`)

    // Everything the chips leave out, so the graph stays readable while still answering the question
    // a hover asks: which build is this rolling out, and to whom.
    const canaryTitle = canary
        ? [
              t("microfrontend.card.canary"),
              canary.type && t(CANARY_TYPE_LABEL_KEYS[canary.type]),
              canary.deploymentType && t(CANARY_DEPLOYMENT_TYPE_LABEL_KEYS[canary.deploymentType]),
              canary.version || canary.url
          ]
              .filter(Boolean)
              .join(" · ")
        : undefined

    return (
        <div className="w-60 overflow-hidden rounded-lg border-2 border-border bg-card text-left shadow-sm transition-colors group-[.is-highlighted]:border-primary">
            <Handle type="target" position={Position.Top} className={HANDLE_CLASS} />

            <div className="flex items-start gap-2 px-3 pt-2.5">
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-card-foreground" title={microfrontend.name}>
                        {microfrontend.name}
                    </div>
                    <div className="truncate text-xs text-foreground-secondary" title={microfrontend.slug}>
                        {microfrontend.slug}
                    </div>
                </div>
                {/* nodrag/nopan keep React Flow from turning the click into a drag; stopPropagation keeps a
                    double click from opening the microfrontend behind the popover. */}
                <span className="nodrag nopan shrink-0" onDoubleClick={event => event.stopPropagation()}>
                    <CloneRepositoryPopover microfrontend={microfrontend} iconOnly />
                </span>
            </div>

            {/* A row of its own, so a canary chip cannot make one node taller than the node beside it. */}
            <div className="mt-2 flex h-9 items-center gap-1.5 border-t border-divider px-3">
                <Badge variant="outline" title={t("microfrontend.card.version", { version: microfrontend.version })}>
                    {microfrontend.version}
                </Badge>
                {canaryLabel && (
                    <Badge className="min-w-0" title={canaryTitle}>
                        <span className="truncate">
                            {t("microfrontend.card.canary")} {canaryLabel}
                        </span>
                    </Badge>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} className={HANDLE_CLASS} />
        </div>
    )
}

export default MicrofrontendFlowNode
