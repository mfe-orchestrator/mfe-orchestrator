import { useTranslation } from "react-i18next"
import { useForm, FormProvider } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import SinglePageLayout from "@/components/SinglePageLayout"

// Define form schema with validation
const formSchema = z
    .object({
        // General Information
        slug: z.string().min(3).max(50),
        name: z.string().min(3).max(100),
        description: z.string().optional(),
        version: z.string().min(1, "Version is required"),
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
    const { project } = useProjectStore()

    const storagesQuery = useQuery({
        queryKey: ["storages", project?._id],
        queryFn: () => storageApi.getMultiple(project?._id)
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
    const notificationToast = useToastNotificationStore()

    const onSubmit = async (data: FormValues) => {
        const dataToSend = {
            ...data
        } as Microfrontend
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
        <SinglePageLayout
            title={isEdit ? t("microfrontend.edit") : t("microfrontend.add_new")}
            description={isEdit ? t("microfrontend.edit_description") : t("microfrontend.add_new_description")}
        >
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
                            <TextField name="version" label={t("microfrontend.version")} placeholder={t("microfrontend.version_placeholder")} required />
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
                                    { value: "CUSTOM_SOURCE", label: t("microfrontend.custom_source") }
                                ]}
                                required
                            />

                            <TextField
                                name="host.entryPoint"
                                label={t("microfrontend.entry_point")}
                                placeholder="index.js"
                            />

                            {hostType === "CUSTOM_URL" && <TextField name="host.url" label={t("microfrontend.custom_url")} placeholder="https://example.com" required />}

                            {hostType === "CUSTOM_SOURCE" && (
                                <SelectField
                                    name="host.storageId"
                                    label={t("microfrontend.source")}
                                    required
                                    options={storagesQuery.data?.map(storage => ({
                                        value: storage._id,
                                        label: storage.name
                                    }))}
                                />
                            )}
                        </CardContent>
                    </Card>

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
