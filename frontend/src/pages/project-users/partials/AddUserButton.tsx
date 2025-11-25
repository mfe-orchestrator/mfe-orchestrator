import SelectField from "@/components/input/SelectField.rhf";
import TextField from "@/components/input/TextField.rhf";
import { Button } from "@/components/atoms";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import useProjectApi, { RoleInProject } from "@/hooks/apiClients/useProjectApi";
import useProjectStore from "@/store/useProjectStore";
import useToastNotificationStore from "@/store/useToastNotificationStore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Plus, UserRoundPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const inviteUserSchema = z.object({
  email: z.string().email("Inserisci un indirizzo email valido"),
  role: z.enum([RoleInProject.OWNER, RoleInProject.MEMBER, RoleInProject.VIEWER], {
    required_error: "Seleziona un ruolo per l'utente",
  }),
});

type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

interface AddUserButtonProps {
  onSuccess?: () => void;
}

export const AddUserButton: React.FC<AddUserButtonProps> = ({ onSuccess }) => {
  const { t } = useTranslation();
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const notifications = useToastNotificationStore();
  const projectApi = useProjectApi();
  const { project } = useProjectStore();

  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      role: RoleInProject.VIEWER,
    },
  });

  const inviteUserMutation = useMutation({
    mutationFn: projectApi.inviteUser,
  });

  const onSubmit = async (values: InviteUserFormValues) => {
    await inviteUserMutation.mutateAsync({
      email: values.email!,
      role: values.role,
      projectId: project._id,
    });
    notifications.showSuccessNotification({
      message: t("project_users.invite_success"),
    });
    setIsInviteModalOpen(false);
    onSuccess?.();
    form.reset();
  };

  return (
    <Dialog
      open={isInviteModalOpen}
      onOpenChange={setIsInviteModalOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserRoundPlus />
          {t("project_users.invite_user")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{t("project_users.invite_user_modal_title")}</DialogTitle>
              <DialogDescription>
                {t("project_users.invite_user_modal_description")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <TextField
                name="email"
                label={t("auth.email")}
                placeholder={t("auth.email_placeholder")}
                type="email"
              />
              <SelectField
                name="role"
                label={t("project_users.role")}
                placeholder={t("project_users.select_role")}
                options={[
                  { value: "OWNER", label: t("project_users.roles.admin") },
                  { value: "MEMBER", label: t("project_users.roles.editor") },
                  { value: "VIEWER", label: t("project_users.roles.viewer") },
                ]}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsInviteModalOpen(false)}
                disabled={inviteUserMutation.isPending}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={inviteUserMutation.isPending}>
                {inviteUserMutation.isPending ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  t("project_users.send_invitation")
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default AddUserButton;
