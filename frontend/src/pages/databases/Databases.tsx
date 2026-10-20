import { Card, CardContent, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { Database as DatabaseIcon, Pencil, PlusCircle, Trash2 } from "lucide-react"
import React, { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useDatabaseApi, { Database } from "@/hooks/apiClients/useDatabaseApi"
import useProjectStore from "@/store/useProjectStore"

export const Databases: React.FC = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const projectStore = useProjectStore()
    const databaseApi = useDatabaseApi()

    const [databaseToDelete, setDatabaseToDelete] = useState<Database | null>(null)

    const databasesQuery = useQuery({
        queryKey: ["databases", projectStore.project?._id],
        queryFn: databaseApi.getAll
    })

    const handleCreate = () => {
        navigate("/databases/new")
    }

    // La stringa di connessione e' mascherata: si vede solo cosa si e' scelto, non dove punta
    const addressOf = (database: Database) =>
        database.connection.authType === "credentials" ? `${database.connection.host}:${database.connection.port}/${database.connection.database}` : t("database.authTypes.connectionString")

    return (
        <ApiStatusHandler queries={[databasesQuery]}>
            <SinglePageLayout
                title={t("database.databases")}
                description={t("database.databasesDescription")}
                right={
                    databasesQuery.data?.length > 0 ? (
                        <Button onClick={handleCreate} dataTestId="database-new">
                            <PlusCircle />
                            {t("database.newDatabase")}
                        </Button>
                    ) : null
                }
            >
                {databasesQuery.data?.length > 0 ? (
                    <Table framed>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t("database.name")}</TableHead>
                                <TableHead>{t("database.type")}</TableHead>
                                <TableHead>{t("database.address")}</TableHead>
                                <TableHead />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {databasesQuery.data.map(database => (
                                <TableRow key={database._id} data-testid={`database-row-${database.name}`}>
                                    <TableCell className="font-medium flex items-center gap-4">
                                        <DatabaseIcon className="h-6 w-6 text-muted-foreground" />
                                        {database.name}
                                    </TableCell>
                                    <TableCell>{t(`database.types.${database.type}`)}</TableCell>
                                    <TableCell className="font-mono text-sm">{addressOf(database)}</TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={t("common.edit")}
                                                onClick={() => navigate(`/databases/${database._id}`)}
                                                dataTestId={`database-edit-${database.name}`}
                                            >
                                                <Pencil />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                aria-label={t("common.delete")}
                                                className="text-destructive hover:bg-destructive/15 hover:text-destructive-active"
                                                onClick={() => setDatabaseToDelete(database)}
                                                dataTestId={`database-delete-${database.name}`}
                                            >
                                                <Trash2 />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <Card>
                        <CardContent>
                            <EmptyState
                                size="sm"
                                description={t("database.noDatabasesFound")}
                                actions={
                                    <Button onClick={handleCreate} dataTestId="database-new">
                                        <PlusCircle />
                                        {t("database.newDatabase")}
                                    </Button>
                                }
                            />
                        </CardContent>
                    </Card>
                )}

                <DeleteConfirmationDialog
                    isOpen={databaseToDelete !== null}
                    onOpenChange={open => !open && setDatabaseToDelete(null)}
                    onDelete={async () => {
                        if (databaseToDelete) {
                            await databaseApi.deleteSingle(databaseToDelete._id)
                        }
                    }}
                    // Ricaricare durante la cancellazione smonterebbe la pagina, dialog compreso, sotto lo spinner
                    onDeleteSuccess={() => {
                        setDatabaseToDelete(null)
                        databasesQuery.refetch()
                    }}
                    title={t("common.delete")}
                    description={databaseToDelete ? t("database.deleteDescription", { name: databaseToDelete.name }) : ""}
                />
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default Databases
