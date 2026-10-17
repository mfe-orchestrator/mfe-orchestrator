import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyStateRow, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useTranslation } from "react-i18next"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import type { ServiceVariable } from "@/hooks/apiClients/useServicesApi"
import type { ServiceVariablesKind } from "./serviceVariables"

const TITLE_KEY: Record<ServiceVariablesKind, string> = { configMap: "services.config_map", secrets: "services.secrets" }

/** The config map or the secrets of a service, read only: a column per environment, a secret never shown. */
export const ServiceVariablesTable: React.FC<{ kind: ServiceVariablesKind; variables?: ServiceVariable[]; environments: EnvironmentDTO[] }> = ({ kind, variables = [], environments }) => {
    const { t } = useTranslation()
    const prefix = TITLE_KEY[kind]

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t(`${prefix}.title`)}</CardTitle>
                <CardDescription>{t(`${prefix}.description`)}</CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
                <div className="overflow-x-auto rounded-lg border-2 border-border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/60 hover:bg-muted/60">
                                <TableHead>{t("services.variables.key")}</TableHead>
                                {environments.map(environment => (
                                    <TableHead key={environment._id}>{environment.name}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {variables.length > 0 ? (
                                variables.map(variable => (
                                    <TableRow key={variable.key} className="border-divider hover:bg-primary/5">
                                        <TableCell className="font-mono font-medium">{variable.key}</TableCell>
                                        {environments.map(environment => {
                                            const value = variable.values.find(candidate => candidate.environmentId === environment._id)?.value
                                            return (
                                                <TableCell key={environment._id} className="max-w-[16rem] truncate font-mono text-xs" title={kind === "configMap" ? value : undefined}>
                                                    {value ? (
                                                        kind === "secrets" ? (
                                                            <span className="text-foreground-secondary">{t("services.secrets.set")}</span>
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
                                <EmptyStateRow colSpan={environments.length + 1}>{t(`${prefix}.empty`)}</EmptyStateRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}

export default ServiceVariablesTable
