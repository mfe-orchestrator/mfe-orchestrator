import * as React from 'react';
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
  itemName: string;
  title?: string;
  description?: string;
}

export function DeleteConfirmationDialog({
  isOpen,
  onOpenChange,
  onDelete,
  onDeleteSuccess,
  onCancel,
  itemName,
  title = "Delete Confirmation",
  description = "Are you sure you want to delete",
}: DeleteConfirmationDialogProps) {
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
          {description} "{itemName}"?
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={handleCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
