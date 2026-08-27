import { Card, CardContent, CardHeader, CardTitle, ConfirmByTypingDialog, CopyableValue, DangerZoneCard } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import useOrganizationApi, { ORGANIZATIONS_QUERY_KEY, Organization, RoleInOrganization } from "@/hooks/apiClients/useOrganizationApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { clearProjectIdInLocalStorage } from "@/utils/localStorageUtils"

interface OrganizationFormValues {
    name: string
    description?: string
}

interface OrganizationDetailsSectionProps {
    organization: Organization
    /** How many projects it still holds: an organization can only be deleted once it holds none. */
    projectCount: number
    canAdminister: boolean
}

/** Name, description and identifier of the organization, plus the one irreversible action on it. */
export const OrganizationDetailsSection: React.FC<OrganizationDetailsSectionProps> = ({ organization, projectCount, canAdminister }) => {
    const { t } = useTranslation()
    const organizationApi = useOrganizationApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const navigate = useNavigate()
    const { setOrganization } = useOrganizationStore()
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)

    const form = useForm<OrganizationFormValues>({
        defaultValues: { name: organization.name, description: organization.description ?? "" }
    })

    // Switching organization keeps this page mounted, so the form has to follow the new one.
    useEffect(() => {
        form.reset({ name: organization.name, description: organization.description ?? "" })
    }, [organization.name, organization.description, form])

    const updateMutation = useMutation({
        mutationFn: (values: OrganizationFormValues) =>
            organizationApi.updateOrganization(organization._id, {
                name: values.name,
                // An emptied field means "no description", which the API expresses as an explicit null.
                description: values.description?.trim() ? values.description : null
            }),
        onSuccess: updated => {
            // The switcher and the header read the store, so the new name has to land there too.
            setOrganization({ ...organization, name: updated.name, slug: updated.slug, description: updated.description })
            queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_QUERY_KEY })
            notifications.showSuccessNotification({ message: t("organization.updated") })
        }
    })

    const deleteMutation = useMutation({
        mutationFn: () => organizationApi.deleteOrganization(organization._id),
        onSuccess: () => {
            notifications.showSuccessNotification({ message: t("organization.deleted") })
            // Nothing is selected any more: dropping it sends the app back to the organization picker.
            setOrganization(undefined)
            clearProjectIdInLocalStorage()
            queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_QUERY_KEY })
            navigate("/")
        }
    })

    const isOwner = organization.role === RoleInOrganization.OWNER
    const copyProps = { copyLabel: t("common.copy"), copiedLabel: t("common.copied") }

    return (
        <div className="space-y-4">
            <Card className="pt-4">
                <CardHeader>
                    <CardTitle as="h2">{t("organization.details_title")}</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    {canAdminister ? (
                        <FormProvider {...form}>
                            <form onSubmit={form.handleSubmit(values => updateMutation.mutate(values))} className="flex flex-col gap-4">
                                <TextField<OrganizationFormValues>
                                    name="name"
                                    label={t("organization.name_label")}
                                    required
                                    dataTestId="organization-details-name"
                                    rules={{
                                        required: t("organization.name_required"),
                                        minLength: { value: 2, message: t("organization.name_min_length") }
                                    }}
                                />
                                <TextareaField<OrganizationFormValues> name="description" label={t("organization.description_label")} />
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm text-foreground-secondary">
                                        {t("organization.id_label")}: <CopyableValue value={organization._id} {...copyProps} />
                                    </span>
                                    <Button type="submit" loading={updateMutation.isPending} loadingLabel={t("common.loading")} dataTestId="organization-details-save">
                                        {t("common.save")}
                                    </Button>
                                </div>
                            </form>
                        </FormProvider>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <span className="font-medium text-foreground">{organization.name}</span>
                            {organization.description && <span className="text-sm text-foreground-secondary">{organization.description}</span>}
                        </div>
                    )}
                </CardContent>
            </Card>

            {isOwner && (
                <DangerZoneCard
                    title={t("organization.danger_zone_title")}
                    description={t("organization.danger_zone_subtitle")}
                    actionTitle={t("organization.delete_title")}
                    // Says why the action is refused before it is attempted: the API turns a non-empty
                    // organization down, and deleting its projects is a decision of its own.
                    actionDescription={projectCount > 0 ? t("organization.delete_blocked", { count: projectCount }) : t("organization.delete_description")}
                    actionLabel={t("organization.delete_button")}
                    actionIcon={<Trash2 />}
                    onAction={() => setIsDeleteOpen(true)}
                    disabled={projectCount > 0}
                >
                    <ConfirmByTypingDialog
                        open={isDeleteOpen}
                        onOpenChange={setIsDeleteOpen}
                        expectedText={organization.name}
                        onConfirm={() => deleteMutation.mutateAsync()}
                        isPending={deleteMutation.isPending}
                        title={t("organization.delete_title")}
                        warningTitle={t("organization.delete_warning")}
                        warningDescription={t("organization.delete_dialog_description", { organization: organization.name })}
                        confirmationHint={t("organization.delete_confirmation_hint", { organization: organization.name })}
                        confirmLabel={t("organization.delete_button")}
                        confirmingLabel={t("organization.deleting")}
                        cancelLabel={t("common.cancel")}
                        closeLabel={t("common.close")}
                    />
                </DangerZoneCard>
            )}
        </div>
    )
}

export default OrganizationDetailsSection
