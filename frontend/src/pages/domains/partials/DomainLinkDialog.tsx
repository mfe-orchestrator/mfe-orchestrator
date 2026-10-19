import { zodResolver } from "@hookform/resolvers/zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@mfe-orchestrator/design-system"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as z from "zod"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import useDomainLinksApi from "@/hooks/apiClients/useDomainLinksApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

const formSchema = z.object({ label: z.string().trim().max(100).optional() })

type FormValues = z.infer<typeof formSchema>

interface DomainLinkDialogProps {
    /** The two domains to link, by id and name; the dialog is closed without them */
    link: { source: { id: string; name: string }; target: { id: string; name: string } } | null
    onClose: () => void
}

/** Confirms a relation drawn on the galaxy between two domains, with an optional label, and saves it. */
export const DomainLinkDialog: React.FC<DomainLinkDialogProps> = ({ link, onClose }) => {
    const { t } = useTranslation()
    const domainLinksApi = useDomainLinksApi()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const form = useForm<FormValues>({ resolver: zodResolver(formSchema) })

    useEffect(() => {
        if (link) {
            form.reset({ label: "" })
        }
    }, [link, form.reset])

    const onSubmit = async (data: FormValues) => {
        if (!link) return
        await domainLinksApi.create({ sourceDomainId: link.source.id, targetDomainId: link.target.id, label: data.label || undefined })
        notifications.showSuccessNotification({ message: t("domains.galaxy.link_created") })
        await queryClient.invalidateQueries({ queryKey: ["domain-links"] })
        onClose()
    }

    return (
        <Dialog open={Boolean(link)} onOpenChange={open => !open && onClose()}>
            <DialogContent>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{t("domains.galaxy.link_dialog_title")}</DialogTitle>
                            <DialogDescription>{link && `${link.source.name} → ${link.target.name}`}</DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <TextField
                                name="label"
                                label={t("domains.galaxy.link_label")}
                                placeholder={t("domains.galaxy.link_label_placeholder")}
                                description={t("domains.galaxy.link_label_hint")}
                                dataTestId="domain-link-label"
                            />
                        </div>
                        <DialogFooter>
                            <Button variant="secondary" type="button" onClick={onClose} disabled={form.formState.isSubmitting}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting} dataTestId="domain-link-submit">
                                {t("domains.galaxy.link_action")}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}

export default DomainLinkDialog
