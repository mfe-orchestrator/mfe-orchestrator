import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Badge } from "@/components/ui/badge/badge"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent } from "@/components/ui/card"
import { DeleteConfirmationDialog } from '@/components/ui/DeleteConfirmationDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import useStorageApi from "@/hooks/apiClients/useStorageApi"
import useProjectStore from "@/store/useProjectStore"
import { useQuery } from "@tanstack/react-query"
import { Pencil, Plus, Trash2 } from "lucide-react"
import React, { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

const StoragesPage: React.FC = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const projectStore = useProjectStore()
    const storagesApi = useStorageApi()

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [storageToDelete, setStorageToDelete] = useState<{ id: string, name: string } | null>(null)

    const storagesQuery = useQuery({
        queryKey: ["storages", projectStore.project?._id],
        queryFn: () => storagesApi.getMultiple(projectStore.project?._id)
    })

    const handleEdit = (id: string) => {
        navigate(`/storages/${id}`)
    }

    const handleCreate = () => {
        navigate("/storages/new")
    }

    const handleDelete = async (id: string) => {
        await storagesApi.deleteSingle(id)
        storagesQuery.refetch()
    }

    return (
        <ApiDataFetcher queries={[storagesQuery]}>
            <SinglePageLayout
                title={t("storage.storages")}
                description={t("storage.storagesDescription")}
                right={storagesQuery.data?.length > 0 ? (
                    <Button onClick={handleCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t("storage.newStorage")}
                    </Button>
                ) : null}
            >

                <Card>
                    <CardContent>
                        {storagesQuery.data && storagesQuery.data?.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('storage.name')}</TableHead>
                                        <TableHead>{t('storage.type')}</TableHead>
                                        <TableHead className="text-right">{t('common.actions')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {storagesQuery.data?.map((storage) => (
                                        <TableRow key={storage._id}>
                                            <TableCell className="font-medium">{storage.name}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {storage.type === 'AWS' && <img src="/img/aws.svg" alt="AWS" className="h-5 w-5" />}
                                                    {storage.type === 'AZURE' && <img src="/img/Azure.svg" alt="Azure" className="h-5 w-5" />}
                                                    {storage.type === 'GOOGLE' && <img src="/img/GoogleCloud.svg" alt="Google Cloud" className="h-5 w-5" />}
                                                    <Badge>{storage.type}</Badge>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end space-x-2">
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(storage._id)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => {
                                                        setStorageToDelete({ id: storage._id, name: storage.name })
                                                        setIsDeleteDialogOpen(true)
                                                    }}>
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full">
                                <div className="text-center py-8 text-muted-foreground">{t("storage.noStoragesFound")}</div>
                                <Button onClick={handleCreate}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t("storage.newStorage")}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <DeleteConfirmationDialog
                    isOpen={isDeleteDialogOpen}
                    onOpenChange={setIsDeleteDialogOpen}
                    onDelete={async () => {
                        if (storageToDelete) {
                            await handleDelete(storageToDelete.id)
                        }
                    }}
                    onDeleteSuccess={() => {
                        setStorageToDelete(null)
                    }}
                    title={t('common.delete')}
                    description={storageToDelete ? `${t('common.delete')} "${storageToDelete.name}"?` : ''}
                />
            </SinglePageLayout>
        </ApiDataFetcher>
    )
}

export default StoragesPage
