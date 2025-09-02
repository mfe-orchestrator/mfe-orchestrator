import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from "./button/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./dialog";

interface DeleteConfirmationDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void> | void;
  onDeleteSuccess?: () => void;
  onCancel?: () => void;
  title?: string;
  description?: string;
}

export function DeleteConfirmationDialog({
  isOpen,
  onOpenChange,
  onDelete,
  onDeleteSuccess,
  onCancel,
  title = "Delete Confirmation",
  description = "Are you sure you want to delete",
}: DeleteConfirmationDialogProps) {
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await onDelete();
      onOpenChange(false);
      onDeleteSuccess?.();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p>
          {description}
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={handleCancel} disabled={isDeleting}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? t("common.deleting") : t("common.delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
