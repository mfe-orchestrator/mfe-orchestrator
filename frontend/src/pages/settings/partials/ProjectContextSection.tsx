import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"

/** Stesso limite del backend: il contesto finisce nel prompt di ogni agente che lo legge. */
export const CONTEXT_MAX_LENGTH = 20_000

export interface ProjectContextFormValues {
    context: string
}

interface ProjectContextSectionProps {
    context?: string
    onUpdate: (values: ProjectContextFormValues) => void
    isUpdating: boolean
}

export const ProjectContextSection: React.FC<ProjectContextSectionProps> = ({ context, onUpdate, isUpdating }) => {
    const { t } = useTranslation()

    const form = useForm<ProjectContextFormValues>({ defaultValues: { context: context ?? "" } })

    // Cambiare progetto lascia questa pagina montata, quindi il form deve seguire il nuovo progetto.
    useEffect(() => {
        form.reset({ context: context ?? "" })
    }, [context, form])

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.projectContext.title")}</CardTitle>
                <CardDescription>{t("settings.projectContext.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onUpdate)} className="flex flex-col gap-4">
                        <TextareaField<ProjectContextFormValues>
                            name="context"
                            label={t("settings.projectContext.label")}
                            placeholder={t("settings.projectContext.placeholder")}
                            description={t("settings.projectContext.hint")}
                            rows={14}
                            className="font-mono text-sm"
                            dataTestId="project-context"
                            rules={{ maxLength: { value: CONTEXT_MAX_LENGTH, message: t("settings.projectContext.tooLong", { max: CONTEXT_MAX_LENGTH }) } }}
                        />

                        <div className="flex justify-end">
                            <Button type="submit" loading={isUpdating} loadingLabel={t("common.loading")} dataTestId="project-context-save">
                                {t("common.save")}
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </CardContent>
        </Card>
    )
}

export default ProjectContextSection
