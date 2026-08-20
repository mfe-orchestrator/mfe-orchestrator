import { useMutation } from "@tanstack/react-query"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import useOrganizationApi, { Organization } from "@/hooks/apiClients/useOrganizationApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface CreateOrganizationFormValues {
    name: string
    description?: string
}

interface CreateOrganizationFormProps {
    onCreated: (organization: Organization) => void
    /** Left out on the first-run screen, where there is nothing to go back to. */
    onCancel?: () => void
}

/** The form the very first organization is created from, and the one both switchers offer as "create new". */
export const CreateOrganizationForm: React.FC<CreateOrganizationFormProps> = ({ onCreated, onCancel }) => {
    const { t } = useTranslation()
    const organizationApi = useOrganizationApi()
    const notifications = useToastNotificationStore()
    const form = useForm<CreateOrganizationFormValues>({ defaultValues: { name: "", description: "" } })

    const createMutation = useMutation({
        mutationFn: (values: CreateOrganizationFormValues) => organizationApi.createOrganization(values),
        onSuccess: organization => {
            notifications.showSuccessNotification({ message: t("organization.created") })
            onCreated(organization)
        }
    })

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(values => createMutation.mutate(values))} className="flex flex-col gap-4">
                <TextField<CreateOrganizationFormValues>
                    name="name"
                    label={t("organization.name_label")}
                    placeholder={t("organization.name_placeholder")}
                    required
                    dataTestId="organization-name"
                    rules={{
                        required: t("organization.name_required"),
                        minLength: { value: 2, message: t("organization.name_min_length") }
                    }}
                />
                <TextareaField<CreateOrganizationFormValues> name="description" label={t("organization.description_label")} placeholder={t("organization.description_placeholder")} />
                <div className="flex items-center gap-2">
                    <Button type="submit" className="flex-1" loading={createMutation.isPending} loadingLabel={t("common.loading")} dataTestId="create-organization">
                        {t("organization.create")}
                    </Button>
                    {onCancel && (
                        <Button type="button" variant="secondary" onClick={onCancel}>
                            {t("common.cancel")}
                        </Button>
                    )}
                </div>
            </form>
        </FormProvider>
    )
}

export default CreateOrganizationForm
