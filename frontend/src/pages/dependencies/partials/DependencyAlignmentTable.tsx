import { Card, CardContent, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { DependencyAlignmentIssue } from "@/hooks/apiClients/useDependenciesApi"
import DependencyStatusBadge from "./DependencyStatusBadge"

export interface DependencyAlignmentTableProps {
    issues: DependencyAlignmentIssue[]
    emptyMessage: string
}

export const DependencyAlignmentTable: React.FC<DependencyAlignmentTableProps> = ({ issues, emptyMessage }) => {
    const { t } = useTranslation()

    if (issues.length === 0) {
        return (
            <Card>
                <CardContent className="p-0">
                    <EmptyState size="sm" description={emptyMessage} />
                </CardContent>
            </Card>
        )
    }

    return (
        <Table framed scroll="x">
            <TableHeader>
                <TableRow>
                    <TableHead>{t("dependencies.package")}</TableHead>
                    <TableHead>{t("dependencies.suggested_range")}</TableHead>
                    <TableHead>{t("dependencies.latest_version")}</TableHead>
                    <TableHead>{t("dependencies.declared_by")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {issues.map(issue => (
                    <TableRow key={`${issue.kind}-${issue.name}`}>
                        <TableCell className="font-medium align-top">{issue.name}</TableCell>
                        <TableCell className="align-top">
                            <div className="flex flex-col gap-1 items-start">
                                <code className="text-sm">{issue.suggestedRange}</code>
                                <DependencyStatusBadge status={issue.status} />
                            </div>
                        </TableCell>
                        <TableCell className="align-top">{issue.latestVersion || "-"}</TableCell>
                        <TableCell>
                            <div className="flex flex-wrap gap-2">
                                {issue.occurrences.map(occurrence => (
                                    <Badge
                                        key={occurrence.microfrontendId}
                                        variant={occurrence.aligned ? "default" : "destructive"}
                                        title={occurrence.aligned ? t("dependencies.already_aligned") : t("dependencies.to_be_aligned", { range: issue.suggestedRange })}
                                    >
                                        {occurrence.slug}: {occurrence.range}
                                    </Badge>
                                ))}
                            </div>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

export default DependencyAlignmentTable
