import React, { useMemo } from "react"
import { useForm, useFormContext } from "react-hook-form"
import { useNavigate, useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent } from "@/components/ui/card"
import TextField from "@/components/input/TextField.rhf"
import SelectField from "@/components/input/SelectField.rhf"
import useStorageApi, { Storage, CreateStorageDTO, StorageType } from "@/hooks/apiClients/useStorageApi"
import { useQuery } from "@tanstack/react-query"
import { FormProvider } from "react-hook-form"
import SinglePageLayout from "@/components/SinglePageLayout"
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface StorageAuthFieldsProps {
    storageType: StorageType
}

const StorageAuthFields: React.FC<StorageAuthFieldsProps> = ({ storageType }) => {
    const { t } = useTranslation()
    const { watch } = useFormContext()

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

    switch (storageType) {
        case StorageType.AWS:
            return (
                <>
                    <TextField name="authConfig.accessKeyId" label={t("storage.fields.accessKeyId")} rules={{ required: t("validation.required") }} />
                    <TextField name="authConfig.secretAccessKey" label={t("storage.fields.secretAccessKey")} type="password" rules={{ required: t("validation.required") }} />
                    <TextField name="authConfig.region" label={t("storage.fields.region")} rules={{ required: t("validation.required") }} />
                    <TextField name="authConfig.bucketName" label="Bucket Name" rules={{ required: t("validation.required") }} />
                </>
            )

        case StorageType.GOOGLE:
            const googleAuthType = watch("authConfig.authType")

            return (
                <>
                    <SelectField name="authConfig.authType" label={t("storage.fields.authType")} options={googleAuthTypes} rules={{ required: t("validation.required") }} />

                    <TextField name="authConfig.projectId" label={t("storage.fields.projectId")} rules={{ required: t("validation.required") }} />

                    <TextField name="authConfig.bucketName" label="Bucket Name" rules={{ required: t("validation.required") }} />

                    {googleAuthType === "serviceAccount" && (
                        <>
                            <TextField name="authConfig.credentials.client_email" label={t("storage.fields.clientEmail")} rules={{ required: true }} />
                            <TextField name="authConfig.credentials.private_key" label={t("storage.fields.privateKey")} type="password" rules={{ required: true }} />
                        </>
                    )}

                    {googleAuthType === "apiKey" && <TextField name="authConfig.apiKey" label={t("storage.fields.apiKey")} type="password" rules={{ required: true }} />}
                </>
            )

        case StorageType.AZURE:
            const azureAuthType = watch("authConfig.authType")

            return (
                <>
                    <SelectField name="authConfig.authType" label={t("storage.fields.authType")} options={azureAuthTypes} rules={{ required: t("validation.required") }} />

                    <TextField name="authConfig.containerName" label={t("storage.fields.containerName")} rules={{ required: t("validation.required") }} />

                    {azureAuthType === "connectionString" && (
                        <TextField name="authConfig.connectionString" label={t("storage.fields.connectionString")} type="password" rules={{ required: true }} />
                    )}

                    {(azureAuthType === "sharedKey" || azureAuthType === "aad") && <TextField name="authConfig.accountName" label={t("storage.fields.accountName")} rules={{ required: true }} />}

                    {azureAuthType === "sharedKey" && <TextField name="authConfig.accountKey" label={t("storage.fields.accountKey")} type="password" rules={{ required: true }} />}

                    {azureAuthType === "aad" && (
                        <>
                            <TextField name="authConfig.tenantId" label={t("storage.fields.tenantId")} rules={{ required: true }} />
                            <TextField name="authConfig.clientId" label={t("storage.fields.clientId")} rules={{ required: true }} />
                            <TextField name="authConfig.clientSecret" label={t("storage.fields.clientSecret")} type="password" rules={{ required: true }} />
                        </>
                    )}
                </>
            )

        default:
            return null
    }
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
            notifications.showSuccessNotification({ message: t("storage.notifications.updated") })
        } else {
            await storageApi.create(data)
            notifications.showSuccessNotification({ message: t("storage.notifications.created") })
        }
        await onSubmitSuccess?.();
    }

    const storageTypes = useMemo(() => [
        { value: StorageType.AWS, label: t("storage.types.aws") },
        { value: StorageType.GOOGLE, label: t("storage.types.google") },
        { value: StorageType.AZURE, label: t("storage.types.azure") }
    ], [t])

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                    <CardContent className="pt-6 space-y-6">
                        <TextField name="name" label={t("storage.name")} rules={{ required: t("validation.required") }} />
                        <SelectField
                            name="type"
                            label={t("storage.type")}
                            options={storageTypes}
                            rules={{ required: t("validation.required") }}
                            disabled={isEditMode}
                        />
                        <StorageAuthFields storageType={form.watch("type")} />
                        <div className="flex justify-end space-x-4 pt-4">
                            <Button type="button" variant="secondary" onClick={onCancel}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit">
                                {isEditMode ? t("common.update") : t("common.create")}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
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
