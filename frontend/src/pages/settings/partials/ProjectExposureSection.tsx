import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import { ProjectExposure } from "@/hooks/apiClients/useProjectApi"

/** Stesse regole del backend: un dominio di almeno due etichette, in minuscolo */
const DOMAIN_NAME = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/
/** Il nome di una ClusterIssuer di cert-manager, come lo accetta Kubernetes */
const CERTIFICATE_ISSUER = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/

export interface ProjectExposureFormValues {
    domain: string
    certificateIssuer: string
}

interface ProjectExposureSectionProps {
    exposure?: ProjectExposure
    onUpdate: (values: ProjectExposureFormValues) => void
    isUpdating: boolean
}

/** Il dominio su cui ogni ambiente è esposto, sotto il suo sottodominio: al deploy GitOps ne fa il Gateway */
export const ProjectExposureSection: React.FC<ProjectExposureSectionProps> = ({ exposure, onUpdate, isUpdating }) => {
    const { t } = useTranslation()

    const domain = exposure?.domain ?? ""
    const certificateIssuer = exposure?.certificateIssuer ?? ""
    const form = useForm<ProjectExposureFormValues>({ defaultValues: { domain, certificateIssuer } })

    // Cambiare progetto lascia questa pagina montata, quindi il form deve seguire il nuovo progetto.
    useEffect(() => {
        form.reset({ domain, certificateIssuer })
    }, [domain, certificateIssuer, form])

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.exposure.title")}</CardTitle>
                <CardDescription>{t("settings.exposure.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onUpdate)} className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <TextField<ProjectExposureFormValues>
                                name="domain"
                                label={t("settings.exposure.domain")}
                                placeholder="example.com"
                                description={t("settings.exposure.domain_hint")}
                                dataTestId="project-exposure-domain"
                                containerClassName="flex-[2_1_280px]"
                                // Il backend toglie gli spazi e porta in minuscolo: qui si controlla quello che salverà
                                rules={{ validate: value => !value.trim() || DOMAIN_NAME.test(value.trim().toLowerCase()) || t("settings.exposure.domain_invalid") }}
                            />
                            <TextField<ProjectExposureFormValues>
                                name="certificateIssuer"
                                label={t("settings.exposure.certificate_issuer")}
                                placeholder="letsencrypt"
                                description={t("settings.exposure.certificate_issuer_hint")}
                                dataTestId="project-exposure-certificate-issuer"
                                containerClassName="flex-[1_1_200px]"
                                rules={{ validate: value => !value.trim() || CERTIFICATE_ISSUER.test(value.trim()) || t("settings.exposure.certificate_issuer_invalid") }}
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" loading={isUpdating} loadingLabel={t("common.loading")} dataTestId="project-exposure-save">
                                {t("common.save")}
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </CardContent>
        </Card>
    )
}

export default ProjectExposureSection
