import { Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField } from "@mfe-orchestrator/design-system"
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

/** Le ClusterIssuer che si trovano di solito; un'altra si scrive a mano */
const KNOWN_ISSUERS = ["letsencrypt", "letsencrypt-staging"]
// La select non accetta un valore vuoto: queste due non possono essere nomi Kubernetes, quindi non si confondono con una ClusterIssuer
const NO_ISSUER = "__none__"
const CUSTOM_ISSUER = "__custom__"
/** Le porte standard; un Traefik installato con il chart Helm senza toccarlo ascolta su 8000 e 8443 */
const DEFAULT_HTTP_PORT = 80
const DEFAULT_HTTPS_PORT = 443

export interface ProjectExposureFormValues {
    domain: string
    certificateIssuer: string
    httpPort: number
    httpsPort: number
}

interface ExposureFields {
    domain: string
    issuerChoice: string
    customIssuer: string
    httpPort: string
    httpsPort: string
}

interface ProjectExposureSectionProps {
    exposure?: ProjectExposure
    onUpdate: (values: ProjectExposureFormValues) => void
    isUpdating: boolean
}

const toFields = (domain: string, issuer: string, httpPort: number, httpsPort: number): ExposureFields => {
    const fields = { domain, customIssuer: "", httpPort: String(httpPort), httpsPort: String(httpsPort) }
    if (!issuer) return { ...fields, issuerChoice: NO_ISSUER }
    if (KNOWN_ISSUERS.includes(issuer)) return { ...fields, issuerChoice: issuer }
    return { ...fields, issuerChoice: CUSTOM_ISSUER, customIssuer: issuer }
}

const isPort = (value: string) => /^\d{1,5}$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 65535

/** La ClusterIssuer scelta, vuota per nessuna */
const issuerOf = (issuerChoice: string, customIssuer: string): string => {
    if (issuerChoice === NO_ISSUER) return ""
    if (issuerChoice === CUSTOM_ISSUER) return customIssuer
    return issuerChoice
}

/** Il dominio su cui ogni ambiente è esposto, sotto il suo sottodominio: al deploy GitOps ne fa il Gateway */
export const ProjectExposureSection: React.FC<ProjectExposureSectionProps> = ({ exposure, onUpdate, isUpdating }) => {
    const { t } = useTranslation()

    const domain = exposure?.domain ?? ""
    const certificateIssuer = exposure?.certificateIssuer ?? ""
    const httpPort = exposure?.httpPort ?? DEFAULT_HTTP_PORT
    const httpsPort = exposure?.httpsPort ?? DEFAULT_HTTPS_PORT
    const form = useForm<ExposureFields>({ defaultValues: toFields(domain, certificateIssuer, httpPort, httpsPort) })
    const issuerChoice = form.watch("issuerChoice")

    // Cambiare progetto lascia questa pagina montata, quindi il form deve seguire il nuovo progetto.
    useEffect(() => {
        form.reset(toFields(domain, certificateIssuer, httpPort, httpsPort))
    }, [domain, certificateIssuer, httpPort, httpsPort, form])

    const onSubmit = ({ domain, issuerChoice, customIssuer, httpPort, httpsPort }: ExposureFields) =>
        onUpdate({ domain, certificateIssuer: issuerOf(issuerChoice, customIssuer), httpPort: Number(httpPort), httpsPort: Number(httpsPort) })

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("settings.exposure.title")}</CardTitle>
                <CardDescription>{t("settings.exposure.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <TextField<ExposureFields>
                                name="domain"
                                label={t("settings.exposure.domain")}
                                placeholder="example.com"
                                description={t("settings.exposure.domain_hint")}
                                dataTestId="project-exposure-domain"
                                containerClassName="flex-[2_1_280px]"
                                // Il backend toglie gli spazi e porta in minuscolo: qui si controlla quello che salverà
                                rules={{ validate: value => !value.trim() || DOMAIN_NAME.test(value.trim().toLowerCase()) || t("settings.exposure.domain_invalid") }}
                            />
                            <SelectField<ExposureFields>
                                name="issuerChoice"
                                label={t("settings.exposure.certificate_issuer")}
                                description={t("settings.exposure.certificate_issuer_hint")}
                                containerClassName="flex-[1_1_200px]"
                                options={[
                                    { value: NO_ISSUER, label: t("settings.exposure.certificate_issuer_none") },
                                    ...KNOWN_ISSUERS.map(issuer => ({ value: issuer, label: issuer })),
                                    { value: CUSTOM_ISSUER, label: t("settings.exposure.certificate_issuer_custom") }
                                ]}
                            />
                        </div>

                        {issuerChoice === CUSTOM_ISSUER && (
                            <TextField<ExposureFields>
                                name="customIssuer"
                                label={t("settings.exposure.certificate_issuer_custom_name")}
                                placeholder="my-cluster-issuer"
                                dataTestId="project-exposure-certificate-issuer"
                                rules={{
                                    validate: value => CERTIFICATE_ISSUER.test(value.trim()) || t("settings.exposure.certificate_issuer_invalid")
                                }}
                            />
                        )}

                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <TextField<ExposureFields>
                                name="httpPort"
                                type="number"
                                label={t("settings.exposure.http_port")}
                                placeholder={String(DEFAULT_HTTP_PORT)}
                                description={t("settings.exposure.http_port_hint")}
                                dataTestId="project-exposure-http-port"
                                containerClassName="flex-[1_1_200px]"
                                rules={{ validate: value => isPort(value) || t("settings.exposure.port_invalid") }}
                            />
                            {issuerChoice !== NO_ISSUER && (
                                <TextField<ExposureFields>
                                    name="httpsPort"
                                    type="number"
                                    label={t("settings.exposure.https_port")}
                                    placeholder={String(DEFAULT_HTTPS_PORT)}
                                    description={t("settings.exposure.https_port_hint")}
                                    dataTestId="project-exposure-https-port"
                                    containerClassName="flex-[1_1_200px]"
                                    rules={{ validate: value => isPort(value) || t("settings.exposure.port_invalid") }}
                                />
                            )}
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
