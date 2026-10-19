import { EmptyStateRow, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import type { VariableMapEntry, VariableMapKind } from "@/hooks/apiClients/useVariableMapsApi"

/** The keys of a config map or of a secret, read only: a column per environment, a secret never shown. */
export const VariableEntriesTable: React.FC<{ kind: VariableMapKind; entries?: VariableMapEntry[]; environments: EnvironmentDTO[] }> = ({ kind, entries = [], environments }) => {
    const { t } = useTranslation()

    return (
        <div className="overflow-x-auto rounded-lg border-2 border-border bg-card">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableHead>{t("variableMaps.entries.key")}</TableHead>
                        {environments.map(environment => (
                            <TableHead key={environment._id}>{environment.name}</TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {entries.length > 0 ? (
                        entries.map(entry => (
                            <TableRow key={entry.key} className="border-divider hover:bg-primary/5">
                                <TableCell className="font-mono font-medium">{entry.key}</TableCell>
                                {environments.map(environment => {
                                    const value = entry.values.find(candidate => candidate.environmentId === environment._id)?.value
                                    return (
                                        <TableCell key={environment._id} className="max-w-[16rem] truncate font-mono text-xs" title={kind === "configMap" ? value : undefined}>
                                            {value ? (
                                                kind === "secret" ? (
                                                    <span className="text-foreground-secondary">{t("variableMaps.secret.set")}</span>
                                                ) : (
                                                    value
                                                )
                                            ) : (
                                                <span className="text-foreground-secondary">—</span>
                                            )}
                                        </TableCell>
                                    )
                                })}
                            </TableRow>
                        ))
                    ) : (
                        <EmptyStateRow colSpan={environments.length + 1}>{t("variableMaps.entries.empty")}</EmptyStateRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

export default VariableEntriesTable
