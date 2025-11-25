import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi";
import useMicrofrontendsApi from "@/hooks/apiClients/useMicrofrontendsApi";
import useToastNotificationStore from "@/store/useToastNotificationStore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ApiStatusHandler } from "@/components/organisms";
import SelectField from "../../../../components/input/SelectField.rhf";
import TextField from "../../../../components/input/TextField.rhf";
import { Button } from "@/components/atoms";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";

interface BuildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  microfrontendId: string;
  microfrontendName: string;
}

const FormDataSchema = z.object({
  version: z.string(),
  branch: z.string(),
});

type FormData = z.infer<typeof FormDataSchema>;

export function BuildDialog({
  open,
  onOpenChange,
  microfrontendId,
  microfrontendName,
}: BuildDialogProps) {
  const { t } = useTranslation();
  const { build, getSingle } = useMicrofrontendsApi();
  const { getBranches } = useCodeRepositoriesApi();
  const notifications = useToastNotificationStore();

  // Get microfrontend data first
  const microfrontendQuery = useQuery({
    queryKey: ["microfrontend", microfrontendId],
    queryFn: () => getSingle(microfrontendId),
    enabled: open && !!microfrontendId,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(FormDataSchema),
  });

  const branchesQuery = useQuery({
    queryKey: ["branches", microfrontendId],
    queryFn: async () => {
      const mfe = microfrontendQuery.data;
      const branches = await getBranches(
        mfe.codeRepository.codeRepositoryId,
        mfe.codeRepository.name || mfe.codeRepository.repositoryId,
      );
      const defaultBranch = branches.find((b) => b.default) || branches?.[0];
      if (defaultBranch) {
        form.setValue("branch", defaultBranch.branch, {
          shouldValidate: true,
          shouldTouch: true,
          shouldDirty: true,
        });
      }
      return branches;
    },
    enabled:
      open && !!microfrontendId && !!microfrontendQuery.data?.codeRepository?.codeRepositoryId,
  });

  const onSubmit = async (values: FormData) => {
    await build(microfrontendId, values.version, values.branch);
    notifications.showSuccessNotification({
      message: t("microfrontend.build.buildSuccess", { name: microfrontendName }),
    });
    onOpenChange(false);
  };

  const handleClose = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}>
      <DialogContent>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {t("microfrontend.build.title", { name: microfrontendName })}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-2 mt-2 mb-4">
              <ApiStatusHandler
                queries={[branchesQuery]}
                loadingComponent={<Loader2 className="w-8 h-8 animate-spin" />}>
                {branchesQuery.data ? (
                  <>
                    {branchesQuery.data.length > 1 ? (
                      <SelectField
                        name="branch"
                        label={t("microfrontend.build.branch")}
                        options={branchesQuery.data?.map((b) => ({
                          value: b.branch,
                          label: b.branch,
                        }))}
                      />
                    ) : (
                      <label>{branchesQuery.data[0]?.branch}</label>
                    )}
                  </>
                ) : (
                  <>No Branches</>
                )}
              </ApiStatusHandler>
              <TextField
                name="version"
                label={t("microfrontend.build.version")}
                placeholder={t("microfrontend.build.versionPlaceholder")}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={handleClose}
                disabled={form.formState.isSubmitting}>
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  !form.formState.isValid ||
                  microfrontendQuery.isLoading ||
                  branchesQuery.isLoading
                }>
                {form.formState.isSubmitting
                  ? t("microfrontend.build.building")
                  : t("microfrontend.build.startBuild")}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

export default BuildDialog;
