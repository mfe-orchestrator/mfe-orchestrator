import { zodResolver } from "@hookform/resolvers/zod"
import { Alert, AlertDescription, Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useState } from "react"
import { FieldErrors, FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"
import * as z from "zod"
import useProjectAiModels from "@/components/assistant/useProjectAiModels"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useCodeRepositoriesApi, { ICodeRepository } from "@/hooks/apiClients/useCodeRepositoriesApi"
import useDomainsApi from "@/hooks/apiClients/useDomainsApi"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useMarketApi from "@/hooks/apiClients/useMarketApi"
import useMicrofrontendsApi, { CanaryDeploymentType, CanaryType, Microfrontend, MicrofrontendKind } from "@/hooks/apiClients/useMicrofrontendsApi"
import useStorageApi, { Storage } from "@/hooks/apiClients/useStorageApi"
import { useVariableMapErrorMessage, VariableMap } from "@/hooks/apiClients/useVariableMapsApi"
import {
    CodeRepositorySection,
    DangerZoneRemoveMicrofrontend,
    HostingSection,
    isAiEditAvailable,
    MicrofrontendHeader,
    MicrofrontendKindField,
    ReleaseSection
} from "@/pages/microfrontends/partials/components"
import ServiceEnvFields from "@/pages/services/partials/ServiceEnvFields"
import ServiceRuntimeFields from "@/pages/services/partials/ServiceRuntimeFields"
import ServiceUrlsFields from "@/pages/services/partials/ServiceUrlsFields"
import ServiceVariableMapsFields from "@/pages/services/partials/ServiceVariableMapsFields"
import ServiceVersionsTable from "@/pages/services/partials/ServiceVersionsTable"
import { createServiceRuntimeShape, fromFormUrls, toFormUrls, useProjectEnvironmentsQuery } from "@/pages/services/partials/serviceVariables"
import { useVariableMapsQuery } from "@/pages/variable-maps/partials/variableMaps"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import DomainSelectField from "../domains/partials/DomainSelectField"
import { CONTEXT_MAX_LENGTH } from "../settings/partials/ProjectContextSection"
import { FetchDataTemplateCard } from "../templates-library/partials/"

interface FormMessages {
    path: string
    url: string
    versionRequired: string
    hostUrlRequired: string
    canaryPercentage: string
}

const createFormSchema = (messages: FormMessages) => {
    // What a FRONTEND declares about its container, with the same rules as a service
    const containerSchema = z.object(createServiceRuntimeShape(messages))

    return z
        .object({
            // General Information
            slug: z.string().min(3).max(50),
            name: z.string().min(3).max(100),
            description: z.string().optional(),
            domainId: z.string().nullable().optional(),
            kind: z.enum(MicrofrontendKind),
            context: z.string().max(CONTEXT_MAX_LENGTH).optional(),
            // Required below for a MICROFRONTEND only: a FRONTEND's is set by its pipeline on the first registration
            version: z.string().optional(),
            customVersion: z.string().optional(),
            continuousDeployment: z.boolean().default(false),

            // Hosting Information
            host: z.object({
                type: z.enum(["MFE_ORCHESTRATOR_HUB", "CUSTOM_URL", "CUSTOM_SOURCE"]),
                url: z.string().optional(),
                storageId: z.string().optional(),
                entryPoint: z.string().optional()
            }),

            // Container of a FRONTEND: held for a MICROFRONTEND too, so switching kind keeps what was typed, and checked below only for a FRONTEND
            port: z.string().optional(),
            livenessPath: z.string().optional(),
            readinessPath: z.string().optional(),
            docsPath: z.string().optional(),
            openApiPath: z.string().optional(),
            image: z.object({ repository: z.string().optional() }).optional(),
            urls: z.array(z.string()).optional(),
            env: z
                .array(
                    z.object({
                        name: z.string(),
                        required: z.boolean().default(false),
                        secret: z.boolean().default(false),
                        description: z.string().optional()
                    })
                )
                .optional(),
            configMapIds: z.array(z.string()).optional(),
            secretIds: z.array(z.string()).optional(),

            // Code Repository Settings
            codeRepository: z
                .object({
                    enabled: z.boolean().default(false),
                    codeRepositoryId: z.string().optional(),
                    repositoryId: z.string().optional(),
                    name: z.string().optional(),
                    cloneUrlHttps: z.string().optional(),
                    cloneUrlSsh: z.string().optional(),
                    gitlab: z
                        .object({
                            groupPath: z.string().optional(),
                            groupId: z.number().optional()
                        })
                        .optional(),
                    createData: z
                        .object({
                            name: z.string().min(3).max(100),
                            private: z.boolean().default(false)
                        })
                        .optional()
                })
                .optional(),

            // Canary Settings
            canary: z
                .object({
                    enabled: z.boolean().default(false),
                    percentage: z.number().min(0).max(100).default(0),
                    type: z.enum(CanaryType).optional(),
                    deploymentType: z.enum(["BASED_ON_VERSION", "BASED_ON_URL"]).optional(),
                    url: z.string().optional(),
                    version: z.string().optional()
                })
                .optional()
        })
        .superRefine((data, ctx) => {
            if (data.kind === MicrofrontendKind.FRONTEND) {
                // Its container, with the same rules as a service: every issue lands on the field it is about
                const container = containerSchema.safeParse(data)
                for (const issue of container.error?.issues ?? []) {
                    ctx.addIssue({ code: "custom", message: issue.message, path: issue.path })
                }
                return
            }
            if (!data.version) {
                ctx.addIssue({ code: "custom", message: messages.versionRequired, path: ["version"] })
            }
            if (data.host.type === "CUSTOM_URL" && !data.host.url) {
                ctx.addIssue({ code: "custom", message: messages.hostUrlRequired, path: ["host"] })
            }
            // On User serves the canary to an enrolled list, so it has no traffic share to validate.
            if (data.canary?.enabled && data.canary.type !== CanaryType.ON_USER && !(data.canary.percentage > 0 && data.canary.percentage <= 100)) {
                ctx.addIssue({ code: "custom", message: messages.canaryPercentage, path: ["canary.percentage"] })
            }
        })
}

type FormSchema = ReturnType<typeof createFormSchema>

// The defaults of the schema make some fields optional in what the form holds and required in what it submits
type FormInput = z.input<FormSchema>
type FormValues = z.output<FormSchema>

/** Tabs that own validated fields, in the order they are shown: the first one with an error is the one we jump to. */
const FORM_TABS = ["general", "context", "hosting", "container", "repository"] as const

type FormTab = (typeof FORM_TABS)[number] | "danger"

const isFormTab = (value: string | null): value is FormTab => Boolean(value && ([...FORM_TABS, "danger"] as string[]).includes(value))

const TAB_FIELDS: Record<FormTab, (keyof FormValues)[]> = {
    general: ["name", "slug", "description", "domainId", "kind"],
    context: ["context"],
    hosting: ["host"],
    container: ["port", "livenessPath", "readinessPath", "docsPath", "openApiPath", "image", "urls", "env", "configMapIds", "secretIds"],
    repository: ["codeRepository"],
    danger: []
}

const ErrorDot: React.FC = () => <span className="ml-2 inline-block size-1.5 rounded-full bg-destructive align-middle" aria-hidden="true" />

interface AddNewMicrofrontendPageProps {
    // Add any props if needed
}

interface AddNewMicrofrontendFormProps {
    storages: Storage[]
    repositories: ICodeRepository[]
    frontend?: Microfrontend
    versions?: string[]
    environments: EnvironmentDTO[]
    configMaps: VariableMap[]
    secrets: VariableMap[]
}

const AddNewMicrofrontendForm: React.FC<AddNewMicrofrontendFormProps> = ({ versions, repositories, frontend, storages, environments, configMaps, secrets }) => {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const [searchParams] = useSearchParams()
    const isEdit = Boolean(id)
    const microfrontendsApi = useMicrofrontendsApi()
    const { errorMessage: domainErrorMessage } = useDomainsApi()
    const variableMapErrorMessage = useVariableMapErrorMessage()
    const errorMessage = (error: Error) => microfrontendsApi.errorMessage(error) ?? variableMapErrorMessage(error) ?? domainErrorMessage(error)
    const navigate = useNavigate()
    const template = searchParams.get("template")
    // Created under a parent: a FRONTEND cannot have one, so it is a MICROFRONTEND
    const parentId = isEdit ? null : searchParams.get("parentId")
    // Opened from a domain page: the microfrontend is created in it, and the page is where we go back
    const initialDomainId = searchParams.get("domainId")
    // `?tab=` opens a tab straight away.
    const linkedTab = searchParams.get("tab")
    const [activeTab, setActiveTab] = useState<FormTab>(isFormTab(linkedTab) ? linkedTab : "general")
    const assistantEnabled = useProjectAiModels().enabled

    const getStandardHost = (): FormInput["host"] => {
        const standardHost: FormInput["host"] = {
            type: "MFE_ORCHESTRATOR_HUB",
            entryPoint: "assets/remoteEntry.js"
        }
        if (!storages || storages.length == 0) return standardHost

        const storageId = storages.find(storage => storage.default)?._id
        if (!storageId) return standardHost

        return {
            type: "CUSTOM_SOURCE",
            storageId,
            entryPoint: "assets/remoteEntry.js"
        }
    }

    const formSchema = useMemo(
        () =>
            createFormSchema({
                path: t("services.path_invalid"),
                url: t("services.urls.invalid"),
                versionRequired: t("microfrontend.validation.version_required"),
                hostUrlRequired: t("microfrontend.validation.host_url_required"),
                canaryPercentage: t("microfrontend.validation.canary_percentage")
            }),
        [t]
    )

    // The service defaults until it declares its own: a MICROFRONTEND holds them only in case it is switched to FRONTEND
    const containerDefaults = {
        port: String(frontend?.port ?? 8080),
        livenessPath: frontend?.livenessPath ?? "/health/live",
        readinessPath: frontend?.readinessPath ?? "/health/ready",
        docsPath: frontend?.docsPath ?? "",
        openApiPath: frontend?.openApiPath ?? "",
        image: { repository: frontend?.image?.repository ?? "" },
        urls: toFormUrls(frontend?.urls, environments),
        env: frontend?.env ?? [],
        // Only the maps that still exist: one deleted meanwhile has no checkbox to untick, and would make every save fail
        configMapIds: (frontend?.configMapIds ?? []).filter(id => configMaps.some(map => map._id === id)),
        secretIds: (frontend?.secretIds ?? []).filter(id => secrets.some(map => map._id === id))
    }

    const form = useForm<FormInput, unknown, FormValues>({
        resolver: zodResolver(formSchema),
        // A FRONTEND may be saved without a host: the hosting tab it would be validated in is hidden for it
        defaultValues: frontend
            ? { ...frontend, kind: frontend.kind ?? MicrofrontendKind.MICROFRONTEND, host: frontend.host ?? getStandardHost(), ...containerDefaults }
            : {
                  slug: "",
                  name: "",
                  description: "",
                  domainId: initialDomainId ?? "",
                  context: "",
                  kind: MicrofrontendKind.MICROFRONTEND,
                  version: "1.0.0",
                  host: getStandardHost(),
                  ...containerDefaults,
                  ...(repositories && repositories.length > 0
                      ? {
                            codeRepository: {
                                enabled: Boolean(template),
                                repositoryId: "create_new",
                                codeRepositoryId: repositories.length === 1 ? repositories[0]._id : repositories.find(repo => repo.default)?._id
                            }
                        }
                      : {
                            codeRepository: {
                                enabled: false
                            }
                        }),
                  canary: {
                      enabled: false,
                      percentage: 0,
                      type: CanaryType.ON_SESSION,
                      deploymentType: CanaryDeploymentType.BASED_ON_VERSION
                  }
              }
    })

    const notificationToast = useToastNotificationStore()

    // A template knows the file its build is served by (index.js for single-spa, parcel.js for
    // micro-lc): it replaces the generic default, unless the user already typed one.
    const { getMarketBySlug } = useMarketApi()
    const templateQuery = useQuery({
        queryKey: ["market", template],
        queryFn: () => getMarketBySlug(template as string),
        enabled: Boolean(template) && !isEdit
    })
    const templateEntryPoint = templateQuery.data?.entryPoint

    useEffect(() => {
        if (templateEntryPoint && !form.getFieldState("host.entryPoint").isDirty) {
            form.setValue("host.entryPoint", templateEntryPoint)
        }
    }, [templateEntryPoint, form])

    const kind = form.watch("kind")
    const isFrontend = kind === MicrofrontendKind.FRONTEND

    // The builds of what is saved, not of the kind being chosen: a MICROFRONTEND has no image to show
    const buildsQuery = useQuery({
        queryKey: ["microfrontend-builds", id],
        queryFn: () => microfrontendsApi.getBuilds(id!),
        enabled: isEdit && frontend?.kind === MicrofrontendKind.FRONTEND
    })

    const onSubmit = async (data: FormValues) => {
        const { port, livenessPath, readinessPath, docsPath, openApiPath, image, urls, env, configMapIds, secretIds, ...rest } = data
        const dataToSend = {
            ...rest,
            version: data.version === "custom" ? data.customVersion : data.version,
            // Blank: the microfrontend is in no domain
            domainId: data.domainId || null,
            // Only a FRONTEND declares a container, and MFE Orchestrator runs no canary for it
            ...(data.kind === MicrofrontendKind.FRONTEND
                ? {
                      port: Number(port),
                      livenessPath: livenessPath?.trim(),
                      readinessPath: readinessPath?.trim(),
                      docsPath: docsPath?.trim(),
                      openApiPath: openApiPath?.trim(),
                      image,
                      urls: fromFormUrls(urls ?? [], environments),
                      env,
                      configMapIds,
                      secretIds,
                      canary: data.canary && { ...data.canary, enabled: false }
                  }
                : {})
        } as Microfrontend & { customVersion?: string }

        delete dataToSend.customVersion
        // A FRONTEND's version is the one its pipeline registered last: saving the form must not overwrite it
        if (data.kind === MicrofrontendKind.FRONTEND) delete dataToSend.version

        if (template) {
            if (!dataToSend.codeRepository?.createData) {
                dataToSend.codeRepository.createData = {}
            }
            dataToSend.codeRepository.createData.template = template
            if (!dataToSend.codeRepository.createData.name) {
                dataToSend.codeRepository.createData.name = data.slug
            }
        }

        if (isEdit) {
            await microfrontendsApi.update(id, dataToSend, { customErrorMessage: errorMessage })
            notificationToast.showSuccessNotification({
                message: t("microfrontend.updated_success_message")
            })
        } else {
            if (parentId) {
                dataToSend.parentIds = [parentId]
            }

            await microfrontendsApi.create(dataToSend, { customErrorMessage: errorMessage })
            notificationToast.showSuccessNotification({
                message: t("microfrontend.created_success_message")
            })
        }

        navigate(!isEdit && initialDomainId ? `/domain/${initialDomainId}/structure` : `/microfrontends`)
    }

    const hasRepositories = Boolean(repositories && repositories.length > 0)
    const aiAvailable = isEdit && isAiEditAvailable(frontend, assistantEnabled)

    // Another link followed while the page is open.
    useEffect(() => {
        if (isFormTab(linkedTab)) setActiveTab(linkedTab)
    }, [linkedTab])

    // A linked tab may not exist on this microfrontend (no repository, or not of its kind): fall back to the first one.
    const isTabShown = (tab: FormTab) => {
        if (tab === "repository") return hasRepositories
        if (tab === "danger") return isEdit
        if (tab === "hosting") return !isFrontend
        if (tab === "container") return isFrontend
        return true
    }
    const shownTab = isTabShown(activeTab) ? activeTab : "general"

    /** A tab is flagged when any of the fields it owns failed validation, so an error is never hidden behind an inactive tab. */
    const tabHasErrors = (tab: FormTab) => TAB_FIELDS[tab].some(field => Boolean(form.formState.errors[field]))

    const onInvalid = (errors: FieldErrors<FormInput>) => {
        const firstTabWithErrors = FORM_TABS.find(tab => isTabShown(tab) && TAB_FIELDS[tab].some(field => Boolean(errors[field])))
        if (firstTabWithErrors) setActiveTab(firstTabWithErrors)
    }

    // Edit with AI used to be a tab of this page: old links to it open the AI workspace.
    if (isEdit && linkedTab === "aiChange") {
        const change = searchParams.get("change")
        return <Navigate to={`/microfrontend/${id}${change ? `?change=${encodeURIComponent(change)}` : ""}`} replace />
    }

    const content = (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
                <FetchDataTemplateCard slug={template} />

                <ReleaseSection isEdit={isEdit} versions={versions} savedVersion={frontend?.version} />

                {isEdit && frontend?.kind === MicrofrontendKind.FRONTEND && <ServiceVersionsTable versions={buildsQuery.data ?? []} />}

                <Tabs value={shownTab} onValueChange={value => setActiveTab(value as FormTab)} tabsListPosition="fullWidth">
                    <TabsList>
                        <TabsTrigger value="general" className="flex-1">
                            {t("microfrontend.tabs.general")}
                            {tabHasErrors("general") && <ErrorDot />}
                        </TabsTrigger>
                        <TabsTrigger value="context" className="flex-1">
                            {t("microfrontend.tabs.context")}
                            {tabHasErrors("context") && <ErrorDot />}
                        </TabsTrigger>
                        {isFrontend ? (
                            <TabsTrigger value="container" className="flex-1">
                                {t("microfrontend.kind.container_tab")}
                                {tabHasErrors("container") && <ErrorDot />}
                            </TabsTrigger>
                        ) : (
                            <TabsTrigger value="hosting" className="flex-1">
                                {t("microfrontend.tabs.hosting")}
                                {tabHasErrors("hosting") && <ErrorDot />}
                            </TabsTrigger>
                        )}
                        {hasRepositories && (
                            <TabsTrigger value="repository" className="flex-1">
                                {t("microfrontend.tabs.repository")}
                                {tabHasErrors("repository") && <ErrorDot />}
                            </TabsTrigger>
                        )}
                        {isEdit && (
                            <TabsTrigger value="danger" className="flex-1">
                                {t("microfrontend.tabs.danger_zone")}
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {/* forceMount keeps every tab registered: switching tab must not drop the values or re-run the repository lookups. */}
                    <TabsContent value="general" forceMount>
                        <Card>
                            <CardHeader>
                                <CardTitle className="mb-0">{t("microfrontend.general_information")}</CardTitle>
                                <CardDescription>{t("microfrontend.general_information_description")}</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-col gap-2 pt-3">
                                <MicrofrontendKindField disabled={Boolean(parentId)} frontendDisabled={Boolean(frontend?.parentIds?.length)} />
                                {/* The templates scaffold a pipeline that uploads a bundle, which a FRONTEND does not take */}
                                {isFrontend && template && !isEdit && (
                                    <Alert>
                                        <AlertDescription>{t("microfrontend.kind.template_pipeline_hint")}</AlertDescription>
                                    </Alert>
                                )}
                                <div className="flex flex-wrap gap-x-4 gap-y-2">
                                    <TextField
                                        name="name"
                                        label={t("microfrontend.name")}
                                        placeholder={t("microfrontend.name_placeholder")}
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
                                    <TextField
                                        name="slug"
                                        disabled={isEdit}
                                        label={t("microfrontend.slug")}
                                        placeholder={t("microfrontend.slug_placeholder")}
                                        required
                                        containerClassName="flex-[1_1_240px]"
                                    />
                                </div>
                                <TextareaField name="description" label={t("microfrontend.description")} placeholder={t("microfrontend.description_placeholder")} />
                                <DomainSelectField containerClassName="w-full" />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="context" forceMount>
                        <Card>
                            <CardHeader>
                                <CardTitle className="mb-0">{t("microfrontend.context.title")}</CardTitle>
                                <CardDescription>{t("microfrontend.context.subtitle")}</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-3">
                                <TextareaField
                                    name="context"
                                    label={t("microfrontend.context.label")}
                                    placeholder={t("microfrontend.context.placeholder")}
                                    description={t("microfrontend.context.hint")}
                                    rows={14}
                                    className="font-mono text-sm"
                                    dataTestId="microfrontend-context"
                                />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {isFrontend ? (
                        <TabsContent value="container" forceMount>
                            <div className="flex flex-col gap-6">
                                <ServiceRuntimeFields />
                                <ServiceUrlsFields environments={environments} />
                                <ServiceEnvFields />
                                <ServiceVariableMapsFields configMaps={configMaps} secrets={secrets} />
                            </div>
                        </TabsContent>
                    ) : (
                        <TabsContent value="hosting" forceMount>
                            <HostingSection storages={storages} />
                        </TabsContent>
                    )}

                    {hasRepositories && (
                        <TabsContent value="repository" forceMount>
                            <CodeRepositorySection repositoriesData={repositories || []} isEdit={!!id} microfrontendId={id} savedRepository={frontend?.codeRepository} forceCreation={!isEdit} />
                        </TabsContent>
                    )}

                    {isEdit && (
                        <TabsContent value="danger">
                            <DangerZoneRemoveMicrofrontend microfrontend={frontend} />
                        </TabsContent>
                    )}
                </Tabs>

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

    if (isEdit && frontend) {
        return (
            <div className="flex min-h-full flex-col gap-6">
                <MicrofrontendHeader microfrontend={frontend} active="settings" aiAvailable={aiAvailable} />
                {content}
            </div>
        )
    }

    return (
        <SinglePageLayout title={isEdit ? t("microfrontend.edit") : t("microfrontend.add_new")} description={isEdit ? t("microfrontend.edit_description") : t("microfrontend.add_new_description")}>
            {content}
        </SinglePageLayout>
    )
}

const AddNewMicrofrontendPage: React.FC<AddNewMicrofrontendPageProps> = () => {
    const { id } = useParams<{ id: string }>()
    const isEdit = Boolean(id)
    const microfrontendsApi = useMicrofrontendsApi()
    const storageApi = useStorageApi()
    const codeRepositoriesApi = useCodeRepositoriesApi()
    const { project } = useProjectStore()

    const storagesQuery = useQuery({
        queryKey: ["storages", project?._id],
        queryFn: () => storageApi.getMultiple(project?._id)
    })

    const repositoriesQuery = useQuery({
        queryKey: ["repositories", project?._id],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(project?._id!),
        enabled: !!project?._id
    })

    const frontendQuery = useQuery({
        queryKey: ["mfe", id],
        queryFn: () => microfrontendsApi.getSingle(id),
        enabled: isEdit
    })

    const versionsQuery = useQuery({
        queryKey: ["versions", id],
        queryFn: () => microfrontendsApi.getVersions(id!),
        enabled: isEdit
    })

    // Before the form mounts: a FRONTEND's default values hold one base URL per environment
    const environmentsQuery = useProjectEnvironmentsQuery()
    const configMapsQuery = useVariableMapsQuery("configMap")
    const secretsQuery = useVariableMapsQuery("secret")

    return (
        <ApiStatusHandler queries={[storagesQuery, repositoriesQuery, versionsQuery, frontendQuery, environmentsQuery, configMapsQuery, secretsQuery]} interceptEmpty={false}>
            <AddNewMicrofrontendForm
                storages={storagesQuery.data}
                repositories={repositoriesQuery.data}
                frontend={frontendQuery.data}
                versions={versionsQuery.data}
                environments={environmentsQuery.data ?? []}
                configMaps={configMapsQuery.data ?? []}
                secrets={secretsQuery.data ?? []}
            />
        </ApiStatusHandler>
    )
}

export default AddNewMicrofrontendPage
