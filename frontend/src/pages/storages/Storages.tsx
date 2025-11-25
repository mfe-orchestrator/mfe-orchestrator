import { Badge, Button } from "@/components/atoms";
import { ApiStatusHandler } from "@/components/organisms";
import SinglePageLayout from "@/components/SinglePageLayout";
import { Card, CardContent } from "@/components/ui/card";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import useStorageApi from "@/hooks/apiClients/useStorageApi";
import useProjectStore from "@/store/useProjectStore";
import { useQuery } from "@tanstack/react-query";
import { Pencil, PlusCircle, Trash2 } from "lucide-react";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

export const Storages: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projectStore = useProjectStore();
  const storagesApi = useStorageApi();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [storageToDelete, setStorageToDelete] = useState<{ id: string; name: string } | null>(null);

  const storagesQuery = useQuery({
    queryKey: ["storages", projectStore.project?._id],
    queryFn: () => storagesApi.getMultiple(projectStore.project?._id),
  });

  const handleEdit = (id: string) => {
    navigate(`/storages/${id}`);
  };

  const handleCreate = () => {
    navigate("/storages/new");
  };

  const handleDelete = async (id: string) => {
    await storagesApi.deleteSingle(id);
    storagesQuery.refetch();
  };

  return (
    <ApiStatusHandler queries={[storagesQuery]}>
      <SinglePageLayout
        title={t("storage.storages")}
        description={t("storage.storagesDescription")}
        right={
          storagesQuery.data?.length > 0 ? (
            <Button onClick={handleCreate}>
              <PlusCircle />
              {t("storage.newStorage")}
            </Button>
          ) : null
        }>
        {storagesQuery.data && storagesQuery.data?.length > 0 ? (
          <div className="rounded-md border-2 border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/25">
                  <TableHead>{t("storage.name")}</TableHead>
                  <TableHead>{t("storage.type")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {storagesQuery.data?.map((storage) => (
                  <TableRow key={storage._id}>
                    <TableCell className="font-medium">{storage.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {storage.type === "AWS" && (
                          <img
                            src="/img/aws.svg"
                            alt="AWS"
                            className="h-5 w-5"
                          />
                        )}
                        {storage.type === "AZURE" && (
                          <img
                            src="/img/Azure.svg"
                            alt="Azure"
                            className="h-5 w-5"
                          />
                        )}
                        {storage.type === "GOOGLE" && (
                          <img
                            src="/img/GoogleCloud.svg"
                            alt="Google Cloud"
                            className="h-5 w-5"
                          />
                        )}
                        <Badge>{storage.type}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(storage._id)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:bg-destructive/15 hover:text-destructive-active"
                          onClick={() => {
                            setStorageToDelete({ id: storage._id, name: storage.name });
                            setIsDeleteDialogOpen(true);
                          }}>
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Card>
            <CardContent>
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center py-4 text-foreground">
                  {t("storage.noStoragesFound")}
                </div>
                <Button onClick={handleCreate}>
                  <PlusCircle />
                  {t("storage.newStorage")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <DeleteConfirmationDialog
          isOpen={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onDelete={async () => {
            if (storageToDelete) {
              await handleDelete(storageToDelete.id);
            }
          }}
          onDeleteSuccess={() => {
            setStorageToDelete(null);
          }}
          title={t("common.delete")}
          description={storageToDelete ? `${t("common.delete")} "${storageToDelete.name}"?` : ""}
        />
      </SinglePageLayout>
    </ApiStatusHandler>
  );
};

export default Storages;
