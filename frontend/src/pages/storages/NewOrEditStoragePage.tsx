import React, { useMemo } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge/badge"
import TextField from "@/components/input/TextField.rhf"
import SelectField from "@/components/input/SelectField.rhf"
import useStorageApi, { Storage, CreateStorageDTO, StorageType } from "@/hooks/apiClients/useStorageApi"
import { useQuery } from "@tanstack/react-query"
import { FormProvider } from "react-hook-form"
import SinglePageLayout from "@/components/SinglePageLayout"
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { Key, Settings, Info, Cloud } from "lucide-react"

interface StorageAuthFieldsProps {
    storageType: StorageType
}

const getProviderInfo = (storageType: StorageType) => {
    switch (storageType) {
        case StorageType.AWS:
            return {
                icon: <img src="/img/aws.svg" alt="AWS" className="h-5 w-5" />,
                name: "Amazon S3",
                description: "Configure AWS S3 bucket access credentials"
            }
        case StorageType.GOOGLE:
            return {
                icon: <img src="/img/GoogleCloud.svg" alt="Google Cloud" className="h-5 w-5" />,
                name: "Google Cloud Storage",
                description: "Configure Google Cloud Storage bucket access"
            }
        case StorageType.AZURE:
            return {
                icon: <img src="/img/Azure.svg" alt="Azure" className="h-5 w-5" />,
                name: "Azure Blob Storage",
                description: "Configure Azure Blob Storage container access"
            }
        default:
            return {
                icon: <Cloud className="h-5 w-5" />,
                name: "Storage Provider",
                description: "Configure storage provider settings"
            }
    }
}

const StorageAuthFields: React.FC<StorageAuthFieldsProps> = ({ storageType }) => {
    const { t } = useTranslation()
    const { watch } = useFormContext()
    const providerInfo = getProviderInfo(storageType)

    const googleAuthTypes = [
        { value: "serviceAccount", label: t("storage.authTypes.google.serviceAccount") },
        { value: "apiKey", label: t("storage.authTypes.google.apiKey") },
        { value: "default", label: t("common.default") }
    ]

    const azureAuthTypes = [
        { value: "connectionString", label: t("storage.authTypes.azure.connectionString") },
        { value: "sharedKey", label: t("storage.authTypes.azure.sharedKey") },
        { value: "aad", label: t("storage.authTypes.azure.aad") }
    ]

    const renderStorageConfig = () => {
        switch (storageType) {
            case StorageType.AWS:
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <TextField 
                            name="authConfig.accessKeyId" 
                            label={t("storage.fields.accessKeyId")} 
                            rules={{ required: t("validation.required") }} 
                        />
                        <TextField 
                            name="authConfig.secretAccessKey" 
                            label={t("storage.fields.secretAccessKey")} 
                            type="password" 
                            rules={{ required: t("validation.required") }} 
                        />
                        <TextField 
                            name="authConfig.region" 
                            label={t("storage.fields.region")} 
                            placeholder="us-east-1"
                            rules={{ required: t("validation.required") }} 
                        />
                        <TextField 
                            name="authConfig.bucketName" 
                            label={t("storage.fields.bucketName")} 
                            placeholder="my-bucket-name"
                            rules={{ required: t("validation.required") }} 
                        />
                    </div>
                )

            case StorageType.GOOGLE:
                const googleAuthType = watch("authConfig.authType")
                return (
                    <div className="space-y-4">
                        <SelectField 
                            name="authConfig.authType" 
                            label={t("storage.fields.authType")} 
                            options={googleAuthTypes} 
                            rules={{ required: t("validation.required") }} 
                        />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TextField 
                                name="authConfig.projectId" 
                                label={t("storage.fields.projectId")} 
                                placeholder="my-gcp-project"
                                rules={{ required: t("validation.required") }} 
                            />
                            <TextField 
                                name="authConfig.bucketName" 
                                label={t("storage.fields.bucketName")} 
                                placeholder="my-gcs-bucket"
                                rules={{ required: t("validation.required") }} 
                            />
                        </div>

                        {googleAuthType === "serviceAccount" && (
                            <div className="space-y-4 p-4 bg-muted border rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-primary" />
                                    <h4 className="text-sm font-medium text-foreground">{t("storage.serviceAccountCredentials")}</h4>
                                </div>
                                <div className="grid grid-cols-1 gap-4">
                                    <TextField 
                                        name="authConfig.credentials.client_email" 
                                        label={t("storage.fields.clientEmail")} 
                                        placeholder="service-account@project.iam.gserviceaccount.com"
                                        rules={{ required: true }} 
                                    />
                                    <TextField 
                                        name="authConfig.credentials.private_key" 
                                        label={t("storage.fields.privateKey")} 
                                        type="password" 
                                        rules={{ required: true }} 
                                    />
                                </div>
                            </div>
                        )}

                        {googleAuthType === "apiKey" && (
                            <div className="space-y-4 p-4 bg-muted border rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-primary" />
                                    <h4 className="text-sm font-medium text-foreground">{t("storage.apiKeyAuthentication")}</h4>
                                </div>
                                <TextField 
                                    name="authConfig.apiKey" 
                                    label={t("storage.fields.apiKey")} 
                                    type="password" 
                                    rules={{ required: true }} 
                                />
                            </div>
                        )}
                    </div>
                )

            case StorageType.AZURE:
                const azureAuthType = watch("authConfig.authType")
                return (
                    <div className="space-y-4">
                        <SelectField 
                            name="authConfig.authType" 
                            label={t("storage.fields.authType")} 
                            options={azureAuthTypes} 
                            required
                            rules={{ required: t("validation.required") }} 
                        />
                        
                        <TextField 
                            name="authConfig.containerName" 
                            label={t("storage.fields.containerName")} 
                            placeholder="my-container"
                            required
                            rules={{ required: t("validation.required") }} 
                        />

                        <TextField 
                            name="path"
                            label={t("storage.fields.path")} 
                            placeholder="/"
                        />

                        {azureAuthType === "connectionString" && (
                            <div className="space-y-4 p-4 bg-muted border rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-primary" />
                                    <h4 className="text-sm font-medium text-foreground">{t("storage.connectionString")}</h4>
                                </div>
                                <TextField 
                                    name="authConfig.connectionString" 
                                    label={t("storage.fields.connectionString")} 
                                    type="password" 
                                    required
                                    rules={{ required: true }} 
                                />
                            </div>
                        )}

                        {(azureAuthType === "sharedKey" || azureAuthType === "aad") && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TextField 
                                    name="authConfig.accountName" 
                                    label={t("storage.fields.accountName")} 
                                    placeholder="mystorageaccount"
                                    required
                                    rules={{ required: true }} 
                                />
                            </div>
                        )}

                        {azureAuthType === "sharedKey" && (
                            <div className="space-y-4 p-4 bg-muted border rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-primary" />
                                    <h4 className="text-sm font-medium text-foreground">{t("storage.sharedKeyAuthentication")}</h4>
                                </div>
                                <TextField 
                                    name="authConfig.accountKey" 
                                    label={t("storage.fields.accountKey")} 
                                    required
                                    type="password" 
                                    rules={{ required: true }} 
                                />
                            </div>
                        )}

                        {azureAuthType === "aad" && (
                            <div className="space-y-4 p-4 bg-muted border rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Key className="h-4 w-4 text-primary" />
                                    <h4 className="text-sm font-medium text-foreground">{t("storage.azureAdAuthentication")}</h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <TextField 
                                        name="authConfig.tenantId" 
                                        label={t("storage.fields.tenantId")} 
                                        rules={{ required: true }} 
                                    />
                                    <TextField 
                                        name="authConfig.clientId" 
                                        label={t("storage.fields.clientId")} 
                                        rules={{ required: true }} 
                                    />
                                </div>
                                <TextField 
                                    name="authConfig.clientSecret" 
                                    label={t("storage.fields.clientSecret")} 
                                    type="password" 
                                    rules={{ required: true }} 
                                />
                            </div>
                        )}
                    </div>
                )

            default:
                return null
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border">
                {providerInfo.icon}
                <div>
                    <h3 className="font-medium text-foreground">{providerInfo.name}</h3>
                    <p className="text-sm text-muted-foreground">{providerInfo.description}</p>
                </div>
            </div>
            {renderStorageConfig()}
        </div>
    )
}

interface StorageFormProps {
    initialData?: Storage
    id?: string
    onCancel: () => void | Promise<void>
    onSubmitSuccess?: () => void | Promise<void>
}

const StorageForm: React.FC<StorageFormProps> = ({initialData, id, onCancel, onSubmitSuccess }) => {
    const { t } = useTranslation()
    const storageApi = useStorageApi()
    const notifications = useToastNotificationStore();
    const isEditMode = Boolean(id)

    const form = useForm<CreateStorageDTO>({
        defaultValues: initialData as unknown as CreateStorageDTO || {
            name: "",
            type: StorageType.AWS,
            authConfig: {
                accessKeyId: "",
                secretAccessKey: "",
                bucketName: "",
                region: "us-east-1"
            }
        }
    })

    const onSubmit = async (data: CreateStorageDTO) => {
        if (isEditMode && id) {
            await storageApi.update(id, data)
            notifications.showSuccessNotification({ message: t("storage.updateSuccess") })
        } else {
            await storageApi.create(data)
            notifications.showSuccessNotification({ message: t("storage.createSuccess") })
        }
        await onSubmitSuccess?.();
    }

    const storageTypes = useMemo(() => [
        { value: StorageType.AWS, label: t("storage.types.aws"), icon: "/img/aws.svg" },
        { value: StorageType.GOOGLE, label: t("storage.types.google"), icon: "/img/GoogleCloud.svg" },
        { value: StorageType.AZURE, label: t("storage.types.azure"), icon: "/img/Azure.svg" }
    ], [t])

    const selectedStorageType = form.watch("type")

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Basic Information Section */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Settings className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>{t("storage.basicInformation")}</CardTitle>
                        </div>
                        <CardDescription>
                            {t("storage.basicInformationDescription")}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <TextField 
                                name="name" 
                                label={t("storage.name")} 
                                placeholder={t("storage.enterStorageName")}
                                rules={{ required: t("validation.required") }} 
                            />
                            <SelectField
                                name="type"
                                label={t("storage.type")}
                                options={storageTypes}
                                rules={{ required: t("validation.required") }}
                                disabled={isEditMode}
                            />
                        </div>
                        
                        {isEditMode && (
                            <Alert>
                                <Info className="h-4 w-4" />
                                <AlertDescription>
                                    {t("storage.typeCannotBeChanged")}
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>

                {/* Provider Configuration Section */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-2">
                            <Key className="h-5 w-5 text-muted-foreground" />
                            <CardTitle>{t("storage.providerConfiguration")}</CardTitle>
                        </div>
                        <CardDescription>
                            {t("storage.providerConfigurationDescription", { storageType: selectedStorageType })}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <StorageAuthFields storageType={selectedStorageType} />
                    </CardContent>
                </Card>

                {/* Security Notice */}
                <Alert>
                    <Key className="h-4 w-4" />
                    <AlertDescription>
                        <strong>{t("storage.securityNotice")}</strong> {t("storage.securityNoticeDescription")}
                    </AlertDescription>
                </Alert>

                {/* Actions */}
                <div className="flex justify-end space-x-4 pt-4">
                    <Button type="button" variant="secondary" onClick={onCancel}>
                        {t("common.cancel")}
                    </Button>
                    <Button type="submit">
                        {isEditMode ? t("common.update") : t("common.create")}
                    </Button>
                </div>
            </form>
        </FormProvider>
    )
}

const NewOrEditStoragePage = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { id } = useParams<{ id?: string }>()
    const isEditMode = Boolean(id)
    const storageApi = useStorageApi()

    const storageQuery = useQuery<Storage>({
        queryKey: ["storage", id],
        queryFn: () => storageApi.getSingle(id!),
        enabled: isEditMode
    })

    const handleSubmitSuccess = () => {
        navigate("/storages")
    }

    const handleCancel = () => {
        navigate("/storages")
    }

    return (
        <SinglePageLayout
            title={isEditMode ? t("storage.editStorage") : t("storage.newStorage")}
            description={isEditMode ? t("storage.editStorageDescription") : t("storage.newStorageDescription")}
        >
            {isEditMode ?
                <ApiDataFetcher queries={[storageQuery]}>
                    <StorageForm
                        initialData={storageQuery.data}
                        onSubmitSuccess={handleSubmitSuccess}
                        onCancel={handleCancel}
                        id={id}
                    />
                </ApiDataFetcher>
                : 
                <StorageForm
                    onSubmitSuccess={handleSubmitSuccess}
                    onCancel={handleCancel}
                />

            }

        </SinglePageLayout>
    )
}

export default NewOrEditStoragePage
