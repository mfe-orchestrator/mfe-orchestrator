import { useTranslation } from "react-i18next"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useNavigate, useParams } from "react-router-dom"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import TextField from "@/components/input/TextField.rhf"
import TextareaField from "@/components/input/TextareaField.rhf"
import SelectField from "@/components/input/SelectField.rhf"
import Switch from "@/components/input/Switch.rhf"
import { useQuery } from "@tanstack/react-query"
import useProjectStore from "@/store/useProjectStore"
import useStorageApi from "@/hooks/apiClients/useStorageApi"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import SinglePageLayout from "@/components/SinglePageLayout"
import { useState, useEffect } from "react"

const logoMap: Record<string, string> = {
    'GITHUB': '/img/GitHub.svg',
    'GITLAB': '/img/GitLab.svg',
    'AZURE_DEV_OPS': '/img/AzureDevOps.svg',
    'AWS': '/img/aws.svg',
    'GOOGLE': '/img/GoogleCloud.svg',
    'AZURE': '/img/Azure.svg'
}

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
            .refine(data => data.type !== "CUSTOM_URL" || (data.url && data.url.length > 0), { message: "URL is required for custom hosting" }),

        // Code Repository Settings
        codeRepository: z
            .object({
                enabled: z.boolean().default(false),
                repositoryId: z.string().optional(),
                name: z.string().optional(),
                azure: z
                    .object({
                        projectId: z.string().optional()
                    })
                    .optional(),
                github: z
                    .object({
                        organizationId: z.string().optional(),
                        private: z.boolean().default(false),
                    })
                    .optional(),
                gitlab: z
                    .object({
                        groupId: z.string().optional(),
                        path: z.string().optional(),
                        private: z.boolean().default(false),
                    })
                    .optional(),
            })
            .optional(),

        // Canary Settings
        canary: z
            .object({
                enabled: z.boolean().default(false),
                percentage: z.number().min(0).max(100).default(0),
                type: z.enum(["ON_SESSIONS", "ON_USER", "COOKIE_BASED"]).optional(),
                deploymentType: z.enum(["BASED_ON_VERSION", "BASED_ON_URL"]).optional(),
                url: z.string().optional(),
                version: z.string().optional()
            })
            .optional()
    })
    .refine(
        data => {
            if (data.canary?.enabled) {
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

interface AddNewMicrofrontendPageProps {
    // Add any props if needed
}

const AddNewMicrofrontendPage: React.FC<AddNewMicrofrontendPageProps> = () => {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const isEdit = Boolean(id)
    const microfrontendsApi = useMicrofrontendsApi()
    const navigate = useNavigate()
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

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            slug: "",
            name: "",
            description: "",
            version: "1.0.0",
            host: {
                type: "MFE_ORCHESTRATOR_HUB",
                entryPoint: "index.js"
            },
            codeRepository: {
                enabled: false,
                repositoryId: "",
                azure: {
                    projectId: ""
                },
                github: {
                    organizationId: "",
                    private: false,
                },
                gitlab: {
                    groupId: "",
                    path: "",
                    private: false,
                },
                name: ""
            },
            canary: {
                enabled: false,
                percentage: 0,
                type: "ON_SESSIONS",
                deploymentType: "BASED_ON_VERSION",
                version: "",
                url: ""
            }
        }
    })

    useQuery({
        queryKey: ["mfe", id],
        queryFn: async () => {
            const mfe = await microfrontendsApi.getSingle(id)
            form.reset(mfe)
            return mfe
        },
        enabled: isEdit
    })

    const { watch } = form
    const canaryEnabled = watch("canary.enabled")
    const hostType = watch("host.type")
    const codeRepositoryEnabled = watch("codeRepository.enabled")
    const selectedRepositoryId = watch("codeRepository.repositoryId")
    const selectedGitlabGroupId = watch("codeRepository.gitlab.groupId")

    const [repositoryNameAvailability, setRepositoryNameAvailability] = useState<{
        checking: boolean
        available: boolean | null
        error: string | null
    }>({
        checking: false,
        available: null,
        error: null
    })

    const azureProjectsQuery = useQuery({
        queryKey: ["azureProjects", selectedRepositoryId],
        queryFn: () => codeRepositoriesApi.getAzureProjects(selectedRepositoryId!),
        enabled: !!selectedRepositoryId && repositoriesQuery.data?.find(repo => repo._id === selectedRepositoryId)?.provider === "AZURE_DEV_OPS"
    })
    
    const gitlabGroupsQuery = useQuery({
        queryKey: ["gitlabGroups", selectedRepositoryId],
        queryFn: () => codeRepositoriesApi.getGitlabGroups(selectedRepositoryId!),
        enabled: !!selectedRepositoryId && repositoriesQuery.data?.find(repo => repo._id === selectedRepositoryId)?.provider === "GITLAB"
    })

    const gitlabGroupPathsQuery = useQuery({
        queryKey: ["gitlabGroupPaths", selectedRepositoryId, selectedGitlabGroupId],
        queryFn: () => codeRepositoriesApi.getGitlabGroupPaths(selectedRepositoryId!, selectedGitlabGroupId!),
        enabled: !!selectedRepositoryId && !!selectedGitlabGroupId && repositoriesQuery.data?.find(repo => repo._id === selectedRepositoryId)?.provider === "GITLAB"
    })

    const versionsQuery = useQuery({
        queryKey: ["versions", id],
        queryFn: () => microfrontendsApi.getVersions(id!),
        enabled: isEdit
    })

    // Repository name availability check with debounce
    /*useEffect(() => {
        if (!repositoryName || !selectedRepositoryId || !selectedAzureProjectId || repositoryName.length < 3) {
            setRepositoryNameAvailability({ checking: false, available: null, error: null })
            return
        }

        const timeoutId = setTimeout(async () => {
            setRepositoryNameAvailability({ checking: true, available: null, error: null })
            
            try {
                const result = await codeRepositoriesApi.checkRepositoryNameAvailability(
                    selectedRepositoryId,
                    selectedAzureProjectId,
                    repositoryName
                )
                setRepositoryNameAvailability({ 
                    checking: false, 
                    available: result.available, 
                    error: null 
                })
            } catch (error) {
                setRepositoryNameAvailability({ 
                    checking: false, 
                    available: null, 
                    error: "Error checking repository name availability" 
                })
            }
        }, 500)

        return () => clearTimeout(timeoutId)
    }, [repositoryName, selectedRepositoryId, selectedAzureProjectId, codeRepositoriesApi])*/

    const notificationToast = useToastNotificationStore()

    const onSubmit = async (data: FormValues) => {
        const dataToSend = {
            ...data,
            version: data.version === "custom" ? data.customVersion : data.version
        } as Microfrontend
        
        delete (dataToSend as any).customVersion
        
        if (isEdit) {
            await microfrontendsApi.update(id, dataToSend)
            notificationToast.showSuccessNotification({
                message: t("microfrontend.updated_success_message")
            })
        } else {
            await microfrontendsApi.create(dataToSend)
            notificationToast.showSuccessNotification({
                message: t("microfrontend.updated_success_message")
            })
        }

        navigate(`/microfrontends`)
    }

    return (
        <SinglePageLayout title={isEdit ? t("microfrontend.edit") : t("microfrontend.add_new")} description={isEdit ? t("microfrontend.edit_description") : t("microfrontend.add_new_description")}>
            <FormProvider {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* General Information Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("microfrontend.general_information")}</CardTitle>
                            <CardDescription>{t("microfrontend.general_information_description")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TextField name="name" label={t("microfrontend.name")} placeholder={t("microfrontend.name_placeholder")} required />
                                <TextField name="slug" label={t("microfrontend.slug")} placeholder={t("microfrontend.slug_placeholder")} required />
                            </div>
                            {isEdit && versionsQuery.data && versionsQuery.data.length > 0 ? (
                                <div className="space-y-4">
                                    <SelectField
                                        name="version"
                                        label={t("microfrontend.version")}
                                        options={[
                                            ...versionsQuery.data.map(version => ({
                                                value: version,
                                                label: version
                                            })),
                                            { value: "custom", label: t("microfrontend.custom_version") }
                                        ]}
                                        required
                                    />
                                    {form.watch("version") === "custom" && (
                                        <TextField 
                                            name="customVersion" 
                                            label={t("microfrontend.custom_version")} 
                                            placeholder={t("microfrontend.version_placeholder")} 
                                            required 
                                        />
                                    )}
                                </div>
                            ) : (
                                <TextField name="version" label={t("microfrontend.version")} placeholder={t("microfrontend.version_placeholder")} required />
                            )}
                            <TextareaField name="description" label={t("microfrontend.description")} placeholder={t("microfrontend.description_placeholder")} />
                        </CardContent>
                    </Card>

                    {/* Hosting Information Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("microfrontend.hosting_information")}</CardTitle>
                            <CardDescription>{t("microfrontend.hosting_information_description")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <SelectField
                                name="host.type"
                                label={t("microfrontend.hosting_type")}
                                options={[
                                    { value: "MFE_ORCHESTRATOR_HUB", label: t("microfrontend.mfe_orchestrator_hub") },
                                    { value: "CUSTOM_URL", label: t("microfrontend.custom_url") },
                                    storagesQuery.data?.length > 0 && { value: "CUSTOM_SOURCE", label: t("microfrontend.custom_source") }
                                ].filter(Boolean)}
                                required
                            />

                            <TextField name="host.entryPoint" label={t("microfrontend.entry_point")} placeholder="index.js" />

                            {hostType === "CUSTOM_URL" && <TextField name="host.url" label={t("microfrontend.custom_url")} placeholder="https://example.com" required />}

                            {hostType === "CUSTOM_SOURCE" && (
                                <SelectField
                                    name="host.storageId"
                                    label={t("microfrontend.source")}
                                    required
                                    options={storagesQuery.data?.map(storage => {
                                        return {
                                            value: storage._id,
                                            label: `${storage.name}`,
                                            icon: logoMap[storage.type]
                                        }
                                    })}
                                />
                            )}
                        </CardContent>
                    </Card>

                    {repositoriesQuery.data?.length > 0 && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>{t("microfrontend.code_repository")}</CardTitle>
                                    <CardDescription>{t("microfrontend.code_repository_description")}</CardDescription>
                                </div>
                                <Switch name="codeRepository.enabled" />
                            </div>
                        </CardHeader>

                        {codeRepositoryEnabled && (
                            <CardContent className="space-y-4">
                                <SelectField
                                    name="codeRepository.repositoryId"
                                    label={t("microfrontend.repository")}
                                    options={repositoriesQuery.data?.map(repo => {
                                        return {
                                            value: repo._id,
                                            label: `${repo.name} (${repo.provider})`,
                                            icon: logoMap[repo.provider]
                                        }
                                    })}
                                    required
                                />

                                <div className="space-y-2">
                                    <TextField name="codeRepository.name" label={t("microfrontend.repository_name")} placeholder={t("microfrontend.repository_name_placeholder")} required />

                                    {repositoryNameAvailability.checking && (
                                        <Alert>
                                            <AlertDescription>Checking repository name availability...</AlertDescription>
                                        </Alert>
                                    )}

                                    {repositoryNameAvailability.available === false && (
                                        <Alert variant="destructive">
                                            <AlertDescription>Repository name is already taken. Please choose a different name.</AlertDescription>
                                        </Alert>
                                    )}

                                    {repositoryNameAvailability.available === true && (
                                        <Alert>
                                            <AlertDescription>Repository name is available.</AlertDescription>
                                        </Alert>
                                    )}

                                    {repositoryNameAvailability.error && (
                                        <Alert variant="destructive">
                                            <AlertDescription>{repositoryNameAvailability.error}</AlertDescription>
                                        </Alert>
                                    )}
                                </div>

                                {selectedRepositoryId && repositoriesQuery.data?.find?.(repo => repo._id === selectedRepositoryId)?.provider === "AZURE_DEV_OPS" && (
                                    <SelectField
                                        name="codeRepository.azure.projectId"
                                        label={t("microfrontend.azure_project")}
                                        options={azureProjectsQuery.data?.value?.map(project => ({
                                            value: project.id,
                                            label: project.name
                                        }))}
                                        required
                                    />
                                )}

                                {selectedRepositoryId && repositoriesQuery.data?.find?.(repo => repo._id === selectedRepositoryId)?.provider === "GITHUB" && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Switch 
                                                name="codeRepository.github.private" 
                                                label={t("microfrontend.github_private")}
                                            />
                                        </div>
                                    </div>
                                )}

                                {selectedRepositoryId && repositoriesQuery.data?.find?.(repo => repo._id === selectedRepositoryId)?.provider === "GITLAB" && (
                                    <div className="space-y-4">
                                        <SelectField
                                            name="codeRepository.gitlab.groupId"
                                            label={t("microfrontend.gitlab_group")}
                                            addClearButton
                                            options={gitlabGroupsQuery.data?.map(group => ({
                                                value: group.id.toString(),
                                                label: group.name || group.full_name
                                            }))}
                                        />

                                        {selectedGitlabGroupId && (
                                            <SelectField
                                                name="codeRepository.gitlab.path"
                                                label={t("microfrontend.gitlab_repository_path")}
                                                addClearButton
                                                options={gitlabGroupPathsQuery.data?.map(repo => ({
                                                    value: repo,
                                                    label: repo
                                                }))}
                                            />
                                        )}
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Switch 
                                                name="codeRepository.gitlab.private" 
                                                label={t("microfrontend.gitlab_private")}
                                            />
                                            <SelectField
                                                name="codeRepository.gitlab.visibility"
                                                label={t("microfrontend.gitlab_visibility")}
                                                options={[
                                                    { value: "public", label: t("microfrontend.visibility_public") },
                                                    { value: "private", label: t("microfrontend.visibility_private") },
                                                    { value: "internal", label: t("microfrontend.visibility_internal") }
                                                ]}
                                            />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                    )}
                    {/* Canary Settings Section */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>{t("microfrontend.canary_settings")}</CardTitle>
                                    <CardDescription>{t("microfrontend.canary_settings_description")}</CardDescription>
                                </div>
                                <Switch name="canary.enabled" />
                            </div>
                        </CardHeader>

                        {canaryEnabled && (
                            <CardContent className="space-y-4">
                                <TextField
                                    name="canary.percentage"
                                    label={t("microfrontend.canary_percentage")}
                                    placeholder="38%"
                                    // type="number"
                                    // required
                                    // min={0}
                                    // max={100}
                                />
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <SelectField
                                        name="canary.type"
                                        label={t("microfrontend.canary_type")}
                                        options={[
                                            { value: "ON_SESSIONS", label: t("microfrontend.on_sessions") },
                                            { value: "ON_USER", label: t("microfrontend.on_user") },
                                            { value: "COOKIE_BASED", label: t("microfrontend.cookie_based") }
                                        ]}
                                        required
                                    />
                                    <SelectField
                                        name="canary.deploymentType"
                                        label={t("microfrontend.deployment_type")}
                                        options={[
                                            { value: "BASED_ON_VERSION", label: t("microfrontend.based_on_version") },
                                            { value: "BASED_ON_URL", label: t("microfrontend.based_on_url") }
                                        ]}
                                        required
                                    />
                                </div>
                                {form.watch("canary.deploymentType") === "BASED_ON_VERSION" && (
                                    <TextField name="canary.canaryVersion" label={t("microfrontend.canary_version")} placeholder="1.1.0" required />
                                )}

                                {form.watch("canary.deploymentType") === "BASED_ON_URL" && (
                                    <TextField name="canary.canaryUrl" label={t("microfrontend.canary_url")} placeholder="https://canary.example.com" required />
                                )}
                            </CardContent>
                        )}
                    </Card>

                    <div className="flex justify-end space-x-4">
                        <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                            {t("common.cancel")}
                        </Button>
                        <Button type="submit">{t("common.save")}</Button>
                    </div>
                </form>
            </FormProvider>
        </SinglePageLayout>
    )
}

export default AddNewMicrofrontendPage
