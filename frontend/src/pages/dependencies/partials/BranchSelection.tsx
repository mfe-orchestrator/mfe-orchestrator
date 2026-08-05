import { AlertTriangle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { Card, CardContent } from "@/components/ui/card"
import { SelectContent } from "@/components/ui/select/partials/selectContent/selectContent"
import { SelectItem } from "@/components/ui/select/partials/selectItem/selectItem"
import { SelectTrigger } from "@/components/ui/select/partials/selectTrigger/selectTrigger"
import { Select, SelectValue } from "@/components/ui/select/select"
import { MicrofrontendScanTarget } from "@/hooks/apiClients/useDependenciesApi"

export interface BranchSelectionProps {
    targets: MicrofrontendScanTarget[]
    selectedBranches: Record<string, string>
    onChange: (microfrontendId: string, branch: string) => void
}

export const BranchSelection: React.FC<BranchSelectionProps> = ({ targets, selectedBranches, onChange }) => {
    const { t } = useTranslation()

    if (targets.length === 0) {
        return null
    }

    return (
        <Card>
            <CardContent className="p-4 flex flex-col gap-3">
                <p className="text-sm text-foreground-secondary">{t("dependencies.branch_selection_description")}</p>
                <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
                    {targets.map(target => {
                        const selected = selectedBranches[target.microfrontendId] || target.defaultBranch
                        const branches = target.branches.length > 0 ? target.branches : selected ? [selected] : []

                        return (
                            <div key={target.microfrontendId} className="flex flex-col gap-1">
                                <span className="text-sm font-medium">{target.name}</span>
                                <span className="text-xs text-foreground-secondary">{target.repositoryName}</span>
                                {target.error ? (
                                    <Badge variant="destructive">
                                        <AlertTriangle className="w-3 h-3" />
                                        {target.error}
                                    </Badge>
                                ) : (
                                    <>
                                        <Select value={selected} onValueChange={branch => onChange(target.microfrontendId, branch)}>
                                            <SelectTrigger className="w-full">
                                                <SelectValue>{selected}</SelectValue>
                                            </SelectTrigger>
                                            <SelectContent>
                                                {branches.map(branch => (
                                                    <SelectItem key={branch} value={branch}>
                                                        {branch}
                                                        {branch === target.defaultBranch ? ` (${t("dependencies.branch_default")})` : ""}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {selected !== target.defaultBranch && <span className="text-xs text-primary">{t("dependencies.branch_not_default")}</span>}
                                    </>
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

export default BranchSelection
