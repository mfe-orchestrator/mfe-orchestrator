import { zodResolver } from "@hookform/resolvers/zod"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, SelectField, Spinner } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import useServicesApi, { Service } from "@/hooks/apiClients/useServicesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface ServiceBuildDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    service: Service
    onBuilt?: () => void
}

const FormDataSchema = z.object({
    version: z.string().min(1),
    branch: z.string()
})

type FormData = z.infer<typeof FormDataSchema>

/** Same flow as the microfrontend build: the tag it creates is what triggers the service pipeline. */
export const ServiceBuildDialog: React.FC<ServiceBuildDialogProps> = ({ open, onOpenChange, service, onBuilt }) => {
    const { t } = useTranslation()
    const { build } = useServicesApi()
    const { getBranches } = useCodeRepositoriesApi()
    const notifications = useToastNotificationStore()
    const form = useForm<FormData>({ resolver: zodResolver(FormDataSchema) })
    const repository = service.codeRepository

    const branchesQuery = useQuery({
        queryKey: ["service-branches", service._id],
        queryFn: async () => {
            const name = repository?.gitlab ? repository.repositoryId : repository?.name || repository?.repositoryId
            const branches = await getBranches(repository!.codeRepositoryId, name!)
            const defaultBranch = branches.find(b => b.default) || branches?.[0]
            if (defaultBranch) {
                form.setValue("branch", defaultBranch.branch, { shouldValidate: true, shouldTouch: true, shouldDirty: true })
            }
            return branches
        },
        enabled: open && !!repository?.codeRepositoryId
    })

    const onSubmit = async (values: FormData) => {
        await build(service._id!, values.version, values.branch)
        notifications.showSuccessNotification({ message: t("services.build.success", { name: service.name }) })
        onBuilt?.()
        onOpenChange(false)
    }

    const handleClose = () => {
        form.reset()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{t("services.build.title", { name: service.name })}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-2 mt-2 mb-4">
                            <ApiStatusHandler queries={[branchesQuery]} loadingComponent={<Spinner size={32} centerScreen={false} label={t("common.loading")} />}>
                                {branchesQuery.data && branchesQuery.data.length > 1 ? (
                                    <SelectField name="branch" label={t("services.build.branch")} options={branchesQuery.data.map(b => ({ value: b.branch, label: b.branch }))} />
                                ) : (
                                    <p className="text-sm text-foreground-secondary">{branchesQuery.data?.[0]?.branch ?? t("services.build.noBranches")}</p>
                                )}
                            </ApiStatusHandler>
                            <TextField name="version" label={t("services.build.version")} placeholder={t("services.build.versionPlaceholder")} required />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={handleClose} disabled={form.formState.isSubmitting}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isValid || branchesQuery.isLoading}>
                                {form.formState.isSubmitting ? t("services.build.building") : t("services.build.start")}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}

export default ServiceBuildDialog
