import { useMutation, useQuery } from "@tanstack/react-query"
import { AlertTriangle, CheckCircle2, GitBranch, Loader2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input/input"
import useDependenciesApi, { AlignmentApplyResult, MicrofrontendAlignmentChange } from "@/hooks/apiClients/useDependenciesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

const DEFAULT_BRANCH_NAME = "chore/align-peer-dependencies"

export interface AlignPeerDependenciesDialogProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    /** Branch compared for each microfrontend: the alignment branch is created from it */
    branches: Record<string, string>
    onApplied?: () => void | Promise<void>
}

const ChangeList: React.FC<{ changes: MicrofrontendAlignmentChange[] }> = ({ changes }) => (
    <ul className="mt-1 flex flex-col gap-1">
        {changes.map(change => (
            <li key={change.name} className="text-sm">
                <code>{change.name}</code>: <code className="text-destructive-active">{change.currentRange}</code> → <code>{change.targetRange}</code>
            </li>
        ))}
    </ul>
)

export const AlignPeerDependenciesDialog: React.FC<AlignPeerDependenciesDialogProps> = ({ isOpen, onOpenChange, branches, onApplied }) => {
    const { t } = useTranslation()
    const dependenciesApi = useDependenciesApi()
    const notifications = useToastNotificationStore()

    const [branchName, setBranchName] = useState(DEFAULT_BRANCH_NAME)
    const [result, setResult] = useState<AlignmentApplyResult | undefined>()

    const planQuery = useQuery({
        queryKey: ["peer-dependencies-alignment-plan", branches],
        queryFn: () => dependenciesApi.getPeerAlignmentPlan({ branches }),
        enabled: isOpen
    })

    const applyMutation = useMutation({
        mutationFn: () => dependenciesApi.alignPeerDependencies({ branchName, branches }),
        onSuccess: async applyResult => {
            setResult(applyResult)

            const applied = applyResult.results.filter(item => item.applied).length
            const failed = applyResult.results.filter(item => item.error).length

            if (failed > 0) {
                notifications.showWarningNotification({ message: t("dependencies.align_partial", { applied, failed }) })
            } else {
                notifications.showSuccessNotification({ message: t("dependencies.align_success", { count: applied, branch: applyResult.targetBranch }) })
            }

            await onApplied?.()
        }
    })

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            setResult(undefined)
            applyMutation.reset()
        }
        onOpenChange(open)
    }

    const plan = planQuery.data
    const hasChanges = Boolean(plan?.microfrontends.length)

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("dependencies.align_dialog_title")}</DialogTitle>
                    <DialogDescription>{t("dependencies.align_dialog_description")}</DialogDescription>
                </DialogHeader>

                {result ? (
                    <div className="flex flex-col gap-3">
                        {result.results.map(item => (
                            <div key={item.microfrontendId} className="rounded-md border-2 border-border p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{item.name}</span>
                                    <span className="text-sm text-foreground-secondary">{item.repositoryName}</span>
                                    {item.error ? (
                                        <Badge variant="destructive">
                                            <AlertTriangle className="w-3 h-3" />
                                            {t("dependencies.align_failed")}
                                        </Badge>
                                    ) : item.applied ? (
                                        <Badge variant="default">
                                            <CheckCircle2 className="w-3 h-3" />
                                            {item.branch}
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline">{t("dependencies.align_nothing_to_do")}</Badge>
                                    )}
                                </div>
                                {item.error ? <p className="mt-1 text-sm text-destructive-active">{item.error}</p> : <ChangeList changes={item.changes} />}
                            </div>
                        ))}
                    </div>
                ) : planQuery.isPending ? (
                    <div className="flex items-center justify-center min-h-[120px]">
                        <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                ) : !hasChanges ? (
                    <p className="text-foreground">{t("dependencies.no_peer_issues")}</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium">{t("dependencies.target_branch")}</span>
                            <Input value={branchName} onChange={event => setBranchName(event.target.value)} fullWidth />
                            <span className="text-xs text-foreground-secondary">{t("dependencies.target_branch_hint")}</span>
                        </label>

                        <div className="flex flex-col gap-3">
                            {plan?.microfrontends.map(item => (
                                <div key={item.microfrontendId} className="rounded-md border-2 border-border p-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium">{item.name}</span>
                                        <span className="text-sm text-foreground-secondary">{item.repositoryName}</span>
                                        <Badge variant="outline">
                                            <GitBranch className="w-3 h-3" />
                                            {item.baseBranch}
                                        </Badge>
                                    </div>
                                    <ChangeList changes={item.changes} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="secondary" onClick={() => handleOpenChange(false)}>
                        {result ? t("common.close") : t("common.cancel")}
                    </Button>
                    {!result && (
                        <Button onClick={() => applyMutation.mutate()} disabled={!hasChanges || applyMutation.isPending || !branchName.trim()}>
                            {applyMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            {t("dependencies.align_confirm")}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default AlignPeerDependenciesDialog
