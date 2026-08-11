import { Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, GitBranch, Loader2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import useIntegrationApi, { FederationFileChange, FederationIntegrationApplyResult, FederationIntegrationStatus, MicrofrontendIntegrationPlan } from "@/hooks/apiClients/useIntegrationApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import StackBadge from "./StackBadge"

export interface IntegrateMicrofrontendsDialogProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
}

/** Only these two mean there is something to write, the rest is there to explain why not */
const WRITABLE: FederationIntegrationStatus[] = ["CONFIG_TO_CREATE", "CONFIG_TO_REPLACE"]

const STATUS_KEYS: Record<FederationIntegrationStatus, string> = {
    ALREADY_INTEGRATED: "status_already_integrated",
    CONFIG_TO_CREATE: "status_config_to_create",
    CONFIG_TO_REPLACE: "status_config_to_replace",
    NO_REMOTES: "status_no_remotes",
    STACK_UNKNOWN: "status_stack_unknown",
    RUNTIME_INTEGRATION: "status_runtime_integration",
    ERROR: "status_error"
}

const STATUS_VARIANTS: Record<FederationIntegrationStatus, "default" | "outline" | "destructive"> = {
    ALREADY_INTEGRATED: "default",
    CONFIG_TO_CREATE: "outline",
    CONFIG_TO_REPLACE: "outline",
    NO_REMOTES: "outline",
    STACK_UNKNOWN: "outline",
    RUNTIME_INTEGRATION: "outline",
    ERROR: "destructive"
}

const FileChange: React.FC<{ change: FederationFileChange }> = ({ change }) => {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const isNew = change.currentContent === undefined

    return (
        <div className="mt-2">
            <div className="flex flex-wrap items-center gap-2">
                <code className="text-sm">{change.path}</code>
                <Badge variant="outline">{isNew ? t("integration.fe_integration_tab.integrate_file_new") : t("integration.fe_integration_tab.integrate_file_replaced")}</Badge>
                <Button variant="secondary" onClick={() => setExpanded(!expanded)}>
                    {expanded ? t("integration.fe_integration_tab.integrate_hide_diff") : t("integration.fe_integration_tab.integrate_show_diff")}
                </Button>
            </div>

            {expanded && (
                <div className="mt-2 flex flex-col gap-2">
                    {!isNew && (
                        <div>
                            <p className="text-xs font-medium text-foreground-secondary">{t("integration.fe_integration_tab.integrate_current_content")}</p>
                            <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs max-h-60">
                                <code>{change.currentContent}</code>
                            </pre>
                        </div>
                    )}
                    <div>
                        <p className="text-xs font-medium text-foreground-secondary">{t("integration.fe_integration_tab.integrate_proposed_content")}</p>
                        <pre className="bg-muted p-3 rounded-md overflow-x-auto text-xs max-h-60">
                            <code>{change.proposedContent}</code>
                        </pre>
                    </div>
                </div>
            )}
        </div>
    )
}

const PlanRow: React.FC<{
    item: MicrofrontendIntegrationPlan
    selected: boolean
    onToggle: (microfrontendId: string) => void
}> = ({ item, selected, onToggle }) => {
    const { t } = useTranslation()
    const writable = WRITABLE.includes(item.status)

    return (
        <div className="rounded-md border-2 border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
                {writable && <Checkbox checked={selected} onCheckedChange={() => onToggle(item.microfrontendId)} />}
                <span className="font-medium">{item.name}</span>
                <span className="text-sm text-foreground-secondary">{item.repositoryName}</span>
                {item.branch && (
                    <Badge variant="outline">
                        <GitBranch className="w-3 h-3" />
                        {item.branch}
                    </Badge>
                )}
                <Badge variant={STATUS_VARIANTS[item.status]}>{t(`integration.fe_integration_tab.${STATUS_KEYS[item.status]}`)}</Badge>
            </div>

            <div className="mt-1">
                <StackBadge stack={item.stack} />
            </div>

            {item.remotes.length > 0 && (
                <p className="mt-1 text-sm">
                    <span className="font-medium">{t("integration.fe_integration_tab.integrate_remotes")}:</span> {item.remotes.map(remote => remote.slug).join(", ")}
                </p>
            )}

            {item.error && <p className="mt-1 text-sm text-destructive-active">{item.error}</p>}

            {item.changes.map(change => (
                <FileChange key={change.path} change={change} />
            ))}
        </div>
    )
}

/**
 * Walks every microfrontend of the project, shows what wiring up module federation would change
 * repository by repository, and commits only what was ticked. A config that is already there is
 * shown as a diff first: it is never replaced without being looked at.
 */
export const IntegrateMicrofrontendsDialog: React.FC<IntegrateMicrofrontendsDialogProps> = ({ isOpen, onOpenChange }) => {
    const { t } = useTranslation()
    const integrationApi = useIntegrationApi()
    const notifications = useToastNotificationStore()

    const [deselected, setDeselected] = useState<Set<string>>(new Set())
    const [result, setResult] = useState<FederationIntegrationApplyResult | undefined>()

    const planQuery = useQuery({
        queryKey: ["module-federation-plan"],
        queryFn: integrationApi.getModuleFederationPlan,
        enabled: isOpen
    })

    // Everything writable starts ticked, so the common case is one click: the set tracks what the
    // user took out rather than what they put in, which keeps a refreshed plan selected by default
    const writableItems = (planQuery.data?.microfrontends || []).filter(item => WRITABLE.includes(item.status))
    const selectedIds = writableItems.map(item => item.microfrontendId).filter(id => !deselected.has(id))

    const toggle = (microfrontendId: string) => {
        setDeselected(current => {
            const next = new Set(current)
            if (next.has(microfrontendId)) {
                next.delete(microfrontendId)
            } else {
                next.add(microfrontendId)
            }
            return next
        })
    }

    const applyMutation = useMutation({
        mutationFn: () => integrationApi.applyModuleFederation(selectedIds),
        onSuccess: applyResult => {
            setResult(applyResult)

            const applied = applyResult.results.filter(item => item.applied).length
            const failed = applyResult.results.filter(item => item.error).length

            if (failed > 0) {
                notifications.showWarningNotification({ message: t("integration.fe_integration_tab.integrate_partial", { applied, failed }) })
            } else {
                notifications.showSuccessNotification({ message: t("integration.fe_integration_tab.integrate_success", { count: applied }) })
            }
        }
    })

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            setResult(undefined)
            setDeselected(new Set())
            applyMutation.reset()
        }
        onOpenChange(open)
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("integration.fe_integration_tab.integrate_dialog_title")}</DialogTitle>
                    <DialogDescription>{t("integration.fe_integration_tab.integrate_dialog_description")}</DialogDescription>
                </DialogHeader>

                {result ? (
                    <div className="flex flex-col gap-3">
                        {result.results.map(item => (
                            <div key={item.microfrontendId} className="rounded-md border-2 border-border p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{item.name}</span>
                                    {item.error ? (
                                        <Badge variant="destructive">
                                            <AlertTriangle className="w-3 h-3" />
                                            {t("integration.fe_integration_tab.status_error")}
                                        </Badge>
                                    ) : (
                                        <Badge variant="default">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {item.branch}
                                        </Badge>
                                    )}
                                </div>
                                {item.error ? <p className="mt-1 text-sm text-destructive-active">{item.error}</p> : <code className="text-sm">{item.writtenPaths.join(", ")}</code>}
                            </div>
                        ))}
                    </div>
                ) : planQuery.isPending ? (
                    <div className="flex items-center justify-center min-h-[120px]">
                        <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {writableItems.length === 0 && <p>{t("integration.fe_integration_tab.integrate_nothing_to_do")}</p>}
                        {planQuery.data?.microfrontends.map(item => (
                            <PlanRow key={item.microfrontendId} item={item} selected={!deselected.has(item.microfrontendId)} onToggle={toggle} />
                        ))}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                        {result ? t("common.close") : t("common.cancel")}
                    </Button>
                    {!result && (
                        <Button onClick={() => applyMutation.mutate()} disabled={selectedIds.length === 0 || applyMutation.isPending}>
                            {applyMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t("integration.fe_integration_tab.integrate_confirm")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default IntegrateMicrofrontendsDialog
