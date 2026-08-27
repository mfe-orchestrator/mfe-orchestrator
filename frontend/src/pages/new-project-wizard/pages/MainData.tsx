import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

interface MainDataForm {
    name: string
    description?: string
}

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

const MainData: React.FC<WizardStepProps> = ({ project, onCreated }) => {
    const { t } = useTranslation()
    const projectApi = useProjectApi()
    const notifications = useToastNotificationStore()
    const { organization } = useOrganizationStore()
    const [loading, setLoading] = useState(false)
    const form = useForm<MainDataForm>({ defaultValues: { name: project?.name ?? "", description: project?.description ?? "" } })

    const onSubmit = async (data: MainDataForm) => {
        setLoading(true)
        try {
            const created = await projectApi.createProject({
                // The project is created inside the organization currently in use: the wizard is only
                // ever reached from behind the organization picker.
                organizationId: organization?._id ?? "",
                name: data.name,
                slug: slugify(data.name),
                description: data.description
            })
            onCreated?.(created)
        } catch {
            notifications.showErrorNotification({ message: t("newProjectWizard.main_data.create_error") })
        } finally {
            setLoading(false)
        }
    }

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <StepShell
                    title={t("newProjectWizard.main_data.title")}
                    description={t("newProjectWizard.main_data.description")}
                    footer={<WizardFooter loading={loading} nextLabel={t("newProjectWizard.main_data.submit")} />}
                >
                    <div className="flex flex-col gap-4">
                        <TextField<MainDataForm>
                            name="name"
                            label={t("newProjectWizard.main_data.name_label")}
                            placeholder={t("newProjectWizard.main_data.name_placeholder")}
                            required
                            dataTestId="wizard-project-name"
                            rules={{
                                required: t("newProjectWizard.main_data.name_required"),
                                minLength: { value: 3, message: t("newProjectWizard.main_data.name_min_length") }
                            }}
                        />
                        <TextareaField<MainDataForm>
                            name="description"
                            label={t("newProjectWizard.main_data.description_label")}
                            placeholder={t("newProjectWizard.main_data.description_placeholder")}
                        />
                    </div>
                </StepShell>
            </form>
        </FormProvider>
    )
}

export default MainData
