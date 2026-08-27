import { Card, CardContent, CardHeader, CardTitle, CopyableValue, DescriptionItem, DescriptionList } from "@mfe-orchestrator/design-system"
import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import { Project } from "@/hooks/apiClients/useProjectApi"

export interface ProjectInfoFormValues {
    name: string
    description?: string
}

interface ProjectInfoSectionProps extends Project {
    onUpdate: (values: ProjectInfoFormValues) => void
    isUpdating: boolean
}

export const ProjectInfoSection: React.FC<ProjectInfoSectionProps> = ({ name, slug, _id, description, onUpdate, isUpdating }) => {
    const { t } = useTranslation()

    const copyProps = { copyLabel: t("common.copy"), copiedLabel: t("common.copied") }

    const form = useForm<ProjectInfoFormValues>({
        defaultValues: { name, description: description ?? "" }
    })

    // Cambiare progetto lascia questa pagina montata, quindi il form deve seguire il nuovo progetto.
    useEffect(() => {
        form.reset({ name, description: description ?? "" })
    }, [name, description, form])

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.projectInfo.title")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onUpdate)} className="flex flex-col gap-4">
                        <TextField<ProjectInfoFormValues>
                            name="name"
                            label={t("settings.projectInfo.name")}
                            required
                            dataTestId="project-info-name"
                            rules={{
                                required: t("settings.projectInfo.nameRequired"),
                                minLength: { value: 2, message: t("settings.projectInfo.nameMinLength") }
                            }}
                        />

                        <TextareaField<ProjectInfoFormValues> name="description" label={t("settings.projectInfo.description")} dataTestId="project-info-description" />

                        {/* Slug e ID restano in sola lettura: lo slug fa parte del percorso fisico dei
                            bundle già caricati, ri-derivarlo dal nome li renderebbe irraggiungibili. */}
                        {/* flex-row: le due voci stanno su una riga che va a capo, non incolonnate */}
                        <DescriptionList className="flex-row flex-wrap">
                            <DescriptionItem className="flex-[1_1_200px]" label={t("settings.projectInfo.slug")}>
                                {slug ? <CopyableValue value={slug} {...copyProps} /> : "-"}
                            </DescriptionItem>

                            <DescriptionItem className="flex-[1_1_200px]" label={t("settings.projectInfo.id")}>
                                {_id ? <CopyableValue value={_id} {...copyProps} /> : "-"}
                            </DescriptionItem>
                        </DescriptionList>

                        <div className="flex items-center justify-between gap-4">
                            <span className="text-sm text-foreground-secondary">{t("settings.projectInfo.slugHint")}</span>
                            <Button type="submit" loading={isUpdating} loadingLabel={t("common.loading")} dataTestId="project-info-save">
                                {t("common.save")}
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </CardContent>
        </Card>
    )
}

export default ProjectInfoSection
