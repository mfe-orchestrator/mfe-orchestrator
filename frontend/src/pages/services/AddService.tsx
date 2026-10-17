import { zodResolver } from "@hookform/resolvers/zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, SelectField } from "@mfe-orchestrator/design-system"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import * as z from "zod"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useCodeRepositoriesApi, { ICodeRepository } from "@/hooks/apiClients/useCodeRepositoriesApi"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useMarketApi, { ServiceDefaults } from "@/hooks/apiClients/useMarketApi"
import useServicesApi, { Service, ServiceDTO } from "@/hooks/apiClients/useServicesApi"
import { CodeRepositorySection } from "@/pages/microfrontends/partials/components"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import DomainSelectField from "../domains/partials/DomainSelectField"
import { CONTEXT_MAX_LENGTH } from "../settings/partials/ProjectContextSection"
import ServiceDangerZone from "./partials/ServiceDangerZone"
import ServiceEnvFields from "./partials/ServiceEnvFields"
import ServiceHeader from "./partials/ServiceHeader"
import ServiceVariablesFields from "./partials/ServiceVariablesFields"
import { isServiceTemplate } from "./partials/serviceTemplates"
import { fromFormVariables, SERVICE_VARIABLE_KEY, toFormVariables, useProjectEnvironmentsQuery } from "./partials/serviceVariables"

/** Same rule as the backend (SERVICE_SLUG): the slug names the workspace folder and the CI registration URL */
const SERVICE_SLUG = /^[a-z0-9][a-z0-9-]{1,49}$/

/** Same rule as the backend (SERVICE_HTTP_PATH): a probe or docs path is absolute, at most 256 characters, without whitespace */
const SERVICE_HTTP_PATH = /^\/\S{0,255}$/

/** The fields a service template prefills */
const PREFILLED_FIELDS = ["port", "livenessPath", "readinessPath", "docsPath", "openApiPath"] as const
type PrefilledValues = Record<(typeof PREFILLED_FIELDS)[number], string>

const prefilledValuesOf = (defaults: ServiceDefaults): PrefilledValues => ({
    port: String(defaults.port),
    livenessPath: defaults.livenessPath,
    readinessPath: defaults.readinessPath,
    docsPath: defaults.docsPath ?? "",
    openApiPath: defaults.openApiPath ?? ""
})

interface FormMessages {
    slug: string
    path: string
    variableKey: string
    variableKeyDuplicated: string
}

const variablesSchema = (keyMessage: string) =>
    z.array(
        z.object({
            key: z.string().trim().regex(SERVICE_VARIABLE_KEY, keyMessage),
            values: z.array(z.string()),
            saved: z.boolean().default(false)
        })
    )

const createFormSchema = (messages: FormMessages) =>
    z
        .object({
            slug: z.string().regex(SERVICE_SLUG, messages.slug),
            name: z.string().min(3).max(100),
            description: z.string().optional(),
            domainId: z.string().nullable().optional(),
            context: z.string().max(CONTEXT_MAX_LENGTH).optional(),
            template: z.string().optional(),
            port: z.string().regex(/^\d{1,5}$/),
            livenessPath: z.string().trim().regex(SERVICE_HTTP_PATH, messages.path),
            readinessPath: z.string().trim().regex(SERVICE_HTTP_PATH, messages.path),
            // Blank: the service publishes no API docs
            docsPath: z
                .string()
                .trim()
                .refine(value => value === "" || SERVICE_HTTP_PATH.test(value), messages.path),
            openApiPath: z
                .string()
                .trim()
                .refine(value => value === "" || SERVICE_HTTP_PATH.test(value), messages.path),
            image: z.object({ repository: z.string().optional() }).optional(),
            env: z.array(
                z.object({
                    name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
                    required: z.boolean().default(false),
                    secret: z.boolean().default(false),
                    description: z.string().optional()
                })
            ),
            configMap: variablesSchema(messages.variableKey),
            secrets: variablesSchema(messages.variableKey),
            codeRepository: z
                .object({
                    enabled: z.boolean().default(false),
                    codeRepositoryId: z.string().optional(),
                    repositoryId: z.string().optional(),
                    name: z.string().optional(),
                    cloneUrlHttps: z.string().optional(),
                    cloneUrlSsh: z.string().optional(),
                    gitlab: z.object({ groupPath: z.string().optional(), groupId: z.number().optional() }).optional(),
                    createData: z.object({ name: z.string().min(3).max(100), private: z.boolean().default(false) }).optional()
                })
                .optional()
        })
        // One key in both lists would give the container the same variable twice, as the backend refuses.
        // Secrets first, so a clash lands on the config map entry: a saved secret's key cannot be edited.
        .superRefine((values, context) => {
            const seen = new Set<string>()
            for (const list of ["secrets", "configMap"] as const) {
                values[list].forEach((variable, index) => {
                    if (seen.has(variable.key)) context.addIssue({ code: "custom", path: [list, index, "key"], message: messages.variableKeyDuplicated })
                    seen.add(variable.key)
                })
            }
        })

type FormSchema = ReturnType<typeof createFormSchema>
type FormInput = z.input<FormSchema>
type FormValues = z.output<FormSchema>

interface AddServiceFormProps {
    repositories: ICodeRepository[]
    environments: EnvironmentDTO[]
    service?: Service
}

const AddServiceForm: React.FC<AddServiceFormProps> = ({ repositories, environments, service }) => {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const [searchParams] = useSearchParams()
    const isEdit = Boolean(id)
    const servicesApi = useServicesApi()
    const { errorMessage: domainErrorMessage } = useDomainsApi()
    const { getMarkets } = useMarketApi()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const initialTemplate = searchParams.get("template") ?? undefined
    // Opened from a domain page: the service is created in it, and the page is where we go back
    const initialDomainId = searchParams.get("domainId")
    const hasRepositories = repositories.length > 0

    const marketsQuery = useQuery({ queryKey: ["markets"], queryFn: getMarkets, enabled: !isEdit })
    const serviceTemplates = useMemo(() => (marketsQuery.data ?? []).filter(isServiceTemplate), [marketsQuery.data])

    const formSchema = useMemo(
        () =>
            createFormSchema({
                slug: t("services.slug_invalid"),
                path: t("services.path_invalid"),
                variableKey: t("services.variables.key_invalid"),
                variableKeyDuplicated: t("services.variables.key_duplicated")
            }),
        [t]
    )
    const form = useForm<FormInput, unknown, FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: service
            ? {
                  ...service,
                  domainId: service.domainId ?? "",
                  port: String(service.port),
                  docsPath: service.docsPath ?? "",
                  openApiPath: service.openApiPath ?? "",
                  env: service.env ?? [],
                  configMap: toFormVariables(service.configMap, environments, false),
                  secrets: toFormVariables(service.secrets, environments, true)
              }
            : {
                  slug: "",
                  name: "",
                  description: "",
                  domainId: initialDomainId ?? "",
                  context: "",
                  template: initialTemplate,
                  port: "8080",
                  livenessPath: "/health/live",
                  readinessPath: "/health/ready",
                  docsPath: "",
                  openApiPath: "",
                  image: { repository: "" },
                  env: [],
                  configMap: [],
                  secrets: [],
                  codeRepository: hasRepositories
                      ? {
                            enabled: Boolean(initialTemplate),
                            repositoryId: "create_new",
                            codeRepositoryId: repositories.length === 1 ? repositories[0]._id : repositories.find(repo => repo.default)?._id
                        }
                      : { enabled: false }
              }
    })

    // What the last template filled in: a field still holding it was not edited by hand, so the next template may replace it
    const prefilled = useRef<PrefilledValues>({ port: "8080", livenessPath: "/health/live", readinessPath: "/health/ready", docsPath: "", openApiPath: "" })
    const selectedTemplate = form.watch("template")
    useEffect(() => {
        const defaults = serviceTemplates.find(market => market.slug === selectedTemplate)?.serviceDefaults
        if (isEdit || !defaults) return
        const next = prefilledValuesOf(defaults)
        for (const field of PREFILLED_FIELDS) {
            if (form.getValues(field) === prefilled.current[field]) {
                form.setValue(field, next[field], { shouldDirty: true })
            }
        }
        prefilled.current = next
    }, [selectedTemplate, serviceTemplates, isEdit, form])

    const onSubmit = async (data: FormValues) => {
        // Blank: the service is in no domain
        const dto = {
            ...data,
            domainId: data.domainId || null,
            port: Number(data.port),
            configMap: fromFormVariables(data.configMap, environments),
            secrets: fromFormVariables(data.secrets, environments)
        } as unknown as ServiceDTO
        const template = data.template || undefined

        if (!isEdit && template && dto.codeRepository) {
            dto.codeRepository.createData = { ...dto.codeRepository.createData, template, name: dto.codeRepository.createData?.name || data.slug }
        }

        if (isEdit) {
            await servicesApi.update(id!, dto, { customErrorMessage: domainErrorMessage })
            notifications.showSuccessNotification({ message: t("services.updated_success_message") })
            await queryClient.invalidateQueries({ queryKey: ["service", id] })
            navigate(`/service/${id}`)
        } else {
            const created = await servicesApi.create(dto, { customErrorMessage: domainErrorMessage })
            notifications.showSuccessNotification({ message: t("services.created_success_message") })
            navigate(initialDomainId ? `/domain/${initialDomainId}` : created?._id ? `/service/${created._id}` : "/services")
        }
        await queryClient.invalidateQueries({ queryKey: ["services"] })
    }

    const content = (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="mb-0">{t("services.general_information")}</CardTitle>
                        <CardDescription>{t("services.general_information_description")}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2 pt-3">
                        {!isEdit && (
                            <SelectField
                                name="template"
                                label={t("services.template")}
                                placeholder={t("services.template_placeholder")}
                                options={serviceTemplates.map(market => ({ value: market.slug, label: `${market.name} (${market.framework})` }))}
                                className="w-full"
                            />
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            <TextField
                                name="name"
                                label={t("services.name")}
                                placeholder={t("services.name_placeholder")}
                                textTransform={value => value.replace("  ", " ")}
                                required
                                onChange={e => {
                                    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-")
                                    if (!isEdit) {
                                        form.setValue("slug", slug)
                                        form.setValue("codeRepository.createData.name", slug)
                                    }
                                }}
                                containerClassName="flex-[1_1_240px]"
                            />
                            <TextField name="slug" disabled={isEdit} label={t("services.slug")} placeholder={t("services.slug_placeholder")} required containerClassName="flex-[1_1_240px]" />
                        </div>
                        <TextareaField name="description" label={t("services.description")} placeholder={t("services.description_placeholder")} />
                        <DomainSelectField containerClassName="w-full" />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="mb-0">{t("services.runtime_settings")}</CardTitle>
                        <CardDescription>{t("services.runtime_settings_description")}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-x-4 gap-y-2 pt-3">
                        <TextField name="port" type="number" label={t("services.port")} required containerClassName="flex-[1_1_160px]" />
                        <TextField
                            name="livenessPath"
                            label={t("services.liveness_path")}
                            placeholder="/health/live"
                            description={t("services.liveness_path_hint")}
                            required
                            containerClassName="flex-[1_1_240px]"
                        />
                        <TextField
                            name="readinessPath"
                            label={t("services.readiness_path")}
                            placeholder="/health/ready"
                            description={t("services.readiness_path_hint")}
                            required
                            containerClassName="flex-[1_1_240px]"
                        />
                        <TextField name="docsPath" label={t("services.docs_path")} placeholder="/docs" description={t("services.docs_path_hint")} containerClassName="flex-[1_1_240px]" />
                        <TextField
                            name="openApiPath"
                            label={t("services.openapi_path")}
                            placeholder="/openapi.json"
                            description={t("services.openapi_path_hint")}
                            containerClassName="flex-[1_1_240px]"
                        />
                        <TextField
                            name="image.repository"
                            label={t("services.image_repository")}
                            placeholder="ghcr.io/acme/orders-api"
                            description={t("services.image_repository_hint")}
                            containerClassName="flex-[2_1_320px]"
                        />
                    </CardContent>
                </Card>

                {hasRepositories && <CodeRepositorySection repositoriesData={repositories} isEdit={isEdit} forceCreation={!isEdit} />}

                <ServiceEnvFields />

                <ServiceVariablesFields kind="configMap" environments={environments} />

                <ServiceVariablesFields kind="secrets" environments={environments} />

                <Card>
                    <CardHeader>
                        <CardTitle className="mb-0">{t("services.context.title")}</CardTitle>
                        <CardDescription>{t("services.context.subtitle")}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-3">
                        <TextareaField
                            name="context"
                            label={t("services.context.label")}
                            placeholder={t("services.context.placeholder")}
                            description={t("services.context.hint")}
                            rows={12}
                            className="font-mono text-sm"
                            dataTestId="service-context"
                        />
                    </CardContent>
                </Card>

                {isEdit && service && <ServiceDangerZone service={service} />}

                <div className="flex justify-end gap-2">
                    <Button disabled={form.formState.isSubmitting} type="button" variant="secondary" onClick={() => navigate(-1)}>
                        {t("common.cancel")}
                    </Button>
                    <Button disabled={form.formState.isSubmitting} type="submit">
                        {t("common.save")}
                    </Button>
                </div>
            </form>
        </FormProvider>
    )

    if (isEdit && service) {
        return (
            <div className="flex min-h-full flex-col gap-6">
                <ServiceHeader service={service} active="settings" />
                {content}
            </div>
        )
    }

    return (
        <SinglePageLayout title={t("services.add_new")} description={t("services.add_new_description")}>
            {content}
        </SinglePageLayout>
    )
}

const AddServicePage: React.FC = () => {
    const { id } = useParams<{ id: string }>()
    const isEdit = Boolean(id)
    const servicesApi = useServicesApi()
    const codeRepositoriesApi = useCodeRepositoriesApi()
    const projectId = useProjectStore(state => state.project?._id)

    const repositoriesQuery = useQuery({
        queryKey: ["repositories", projectId],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(projectId!),
        enabled: !!projectId
    })

    const serviceQuery = useQuery({
        queryKey: ["service", id],
        queryFn: () => servicesApi.getSingle(id!),
        enabled: isEdit
    })

    // Before the form mounts: its default values hold one config map and secret value per environment
    const environmentsQuery = useProjectEnvironmentsQuery()

    return (
        <ApiStatusHandler queries={[repositoriesQuery, serviceQuery, environmentsQuery]} interceptEmpty={false}>
            <AddServiceForm repositories={repositoriesQuery.data ?? []} environments={environmentsQuery.data ?? []} service={serviceQuery.data} />
        </ApiStatusHandler>
    )
}

export default AddServicePage
