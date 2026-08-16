import { zodResolver } from "@hookform/resolvers/zod"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { FieldErrors, FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import * as z from "zod"
import { Button } from "@/components/atoms"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useCodeRepositoriesApi, { ICodeRepository } from "@/hooks/apiClients/useCodeRepositoriesApi"
import useMicrofrontendsApi, { CanaryDeploymentType, CanaryType, Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useStorageApi, { Storage } from "@/hooks/apiClients/useStorageApi"
import { CodeRepositorySection, DangerZoneRemoveMicrofrontend, HostingSection, ReleaseSection } from "@/pages/microfrontends/partials/components"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { FetchDataTemplateCard } from "../templates-library/partials/"

// Define form schema with validation
const formSchema = z
    .object({
        // General Information
        slug: z.string().min(3).max(50),
        name: z.string().min(3).max(100),
        description: z.string().optional(),
        version: z.string().min(1, "Version is required"),
        customVersion: z.string().optional(),
        continuousDeployment: z.boolean().default(false),

        // Hosting Information
        host: z
            .object({
                type: z.enum(["MFE_ORCHESTRATOR_HUB", "CUSTOM_URL", "CUSTOM_SOURCE"]),
                url: z.string().optional(),
                storageId: z.string().optional(),
                entryPoint: z.string().optional()
            })
            .refine(data => data.type !== "CUSTOM_URL" || (data.url && data.url.length > 0), {
                message: "URL is required for custom hosting"
            }),

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
    .refine(
        data => {
            // On User serves the canary to an enrolled list, so it has no traffic share to validate.
            if (data.canary?.enabled && data.canary.type !== CanaryType.ON_USER) {
                return data.canary.percentage > 0 && data.canary.percentage <= 100
            }
            return true
        },
        {
            message: "Canary percentage must be between 1 and 100 when enabled",
            path: ["canary.percentage"]
        }
    )

type FormValues = z.infer<typeof formSchema>

/** Tabs that own validated fields, in the order they are shown: the first one with an error is the one we jump to. */
const FORM_TABS = ["general", "hosting", "repository"] as const

type FormTab = (typeof FORM_TABS)[number] | "danger"

const TAB_FIELDS: Record<FormTab, (keyof FormValues)[]> = {
    general: ["name", "slug", "description"],
    hosting: ["host"],
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
}

const AddNewMicrofrontendForm: React.FC<AddNewMicrofrontendFormProps> = ({ versions, repositories, frontend, storages }) => {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const [searchParams] = useSearchParams()
    const isEdit = Boolean(id)
    const microfrontendsApi = useMicrofrontendsApi()
    const navigate = useNavigate()
    const template = searchParams.get("template")
    const [activeTab, setActiveTab] = useState<FormTab>("general")

    const getStandardHost = () => {
        const standardHost = {
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

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: frontend || {
            slug: "",
            name: "",
            description: "",
            version: "1.0.0",
            host: getStandardHost(),
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

    const onSubmit = async (data: FormValues) => {
        const dataToSend = {
            ...data,
            version: data.version === "custom" ? data.customVersion : data.version
        } as Microfrontend & { customVersion?: string }

        delete dataToSend.customVersion

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
            await microfrontendsApi.update(id, dataToSend)
            notificationToast.showSuccessNotification({
                message: t("microfrontend.updated_success_message")
            })
        } else {
            const parentId = searchParams.get("parentId")
            if (parentId) {
                dataToSend.parentIds = [parentId]
            }

            await microfrontendsApi.create(dataToSend)
            notificationToast.showSuccessNotification({
                message: t("microfrontend.created_success_message")
            })
        }

        navigate(`/microfrontends`)
    }

    const hasRepositories = Boolean(repositories && repositories.length > 0)

    /** A tab is flagged when any of the fields it owns failed validation, so an error is never hidden behind an inactive tab. */
    const tabHasErrors = (tab: FormTab) => TAB_FIELDS[tab].some(field => Boolean(form.formState.errors[field]))

    const onInvalid = (errors: FieldErrors<FormValues>) => {
        const firstTabWithErrors = FORM_TABS.find(tab => TAB_FIELDS[tab].some(field => Boolean(errors[field])))
        if (firstTabWithErrors) setActiveTab(firstTabWithErrors)
    }

    return (
        <SinglePageLayout title={isEdit ? t("microfrontend.edit") : t("microfrontend.add_new")} description={isEdit ? t("microfrontend.edit_description") : t("microfrontend.add_new_description")}>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-6">
                    <FetchDataTemplateCard slug={template} />

                    <ReleaseSection isEdit={isEdit} versions={versions} />

                    <Tabs value={activeTab} onValueChange={value => setActiveTab(value as FormTab)} tabsListPosition="fullWidth">
                        <TabsList>
                            <TabsTrigger value="general" className="flex-1">
                                {t("microfrontend.tabs.general")}
                                {tabHasErrors("general") && <ErrorDot />}
                            </TabsTrigger>
                            <TabsTrigger value="hosting" className="flex-1">
                                {t("microfrontend.tabs.hosting")}
                                {tabHasErrors("hosting") && <ErrorDot />}
                            </TabsTrigger>
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
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="hosting" forceMount>
                            <HostingSection storages={storages} />
                        </TabsContent>

                        {hasRepositories && (
                            <TabsContent value="repository" forceMount>
                                <CodeRepositorySection repositoriesData={repositories || []} isEdit={!!id} forceCreation={!isEdit} />
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

    return (
        <ApiStatusHandler queries={[storagesQuery, repositoriesQuery, versionsQuery, frontendQuery]} interceptEmpty={false}>
            <AddNewMicrofrontendForm storages={storagesQuery.data} repositories={repositoriesQuery.data} frontend={frontendQuery.data} versions={versionsQuery.data} />
        </ApiStatusHandler>
    )
}

export default AddNewMicrofrontendPage
