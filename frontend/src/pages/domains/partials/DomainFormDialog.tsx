import { zodResolver } from "@hookform/resolvers/zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@mfe-orchestrator/design-system"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import useDomainsApi, { Domain } from "@/hooks/apiClients/useDomainsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { CONTEXT_MAX_LENGTH } from "../../settings/partials/ProjectContextSection"

const createFormSchema = (nameMessage: string, contextMessage: string) =>
    z.object({
        name: z.string().trim().min(1, nameMessage).max(100),
        description: z.string().optional(),
        context: z.string().max(CONTEXT_MAX_LENGTH, contextMessage).optional()
    })

type FormValues = z.infer<ReturnType<typeof createFormSchema>>

interface DomainFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Edited when given, otherwise a new domain is created */
    domain?: Domain
}

export const DomainFormDialog: React.FC<DomainFormDialogProps> = ({ open, onOpenChange, domain }) => {
    const { t } = useTranslation()
    const domainsApi = useDomainsApi()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const formSchema = useMemo(() => createFormSchema(t("domains.form.name_required"), t("settings.projectContext.tooLong", { max: CONTEXT_MAX_LENGTH })), [t])
    const form = useForm<FormValues>({ resolver: zodResolver(formSchema) })

    useEffect(() => {
        if (open) {
            form.reset({ name: domain?.name ?? "", description: domain?.description ?? "", context: domain?.context ?? "" })
        }
    }, [open, domain, form.reset])

    const onSubmit = async (data: FormValues) => {
        if (domain) {
            await domainsApi.update(domain._id, data)
            notifications.showSuccessNotification({ message: t("domains.updated_success_message") })
            await queryClient.invalidateQueries({ queryKey: ["domain", domain._id] })
        } else {
            await domainsApi.create(data)
            notifications.showSuccessNotification({ message: t("domains.created_success_message") })
        }
        await queryClient.invalidateQueries({ queryKey: ["domains"] })
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{domain ? t("domains.form.edit_title") : t("domains.form.create_title")}</DialogTitle>
                            <DialogDescription>{t("domains.form.description")}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2 py-4">
                            <TextField name="name" label={t("domains.form.name")} placeholder={t("domains.form.name_placeholder")} required dataTestId="domain-name" />
                            <TextareaField name="description" label={t("domains.form.description_label")} placeholder={t("domains.form.description_placeholder")} />
                            <TextareaField
                                name="context"
                                label={t("domains.form.context_label")}
                                placeholder={t("domains.form.context_placeholder")}
                                description={t("domains.form.context_hint")}
                                rows={8}
                                className="font-mono text-sm"
                                dataTestId="domain-context"
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="secondary" type="button" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting} dataTestId="domain-submit">
                                {t("common.save")}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}

export default DomainFormDialog
