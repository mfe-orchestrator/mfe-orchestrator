import { useTranslation } from "react-i18next"
import type { ConnectionTestResult } from "@/components/ConnectionTest"
import useApiClient, { errorCodeOf } from "../useApiClient"

export type Storage = IStorageAuth & {
    _id: string
    name: string
    default: boolean
    config: Record<string, unknown>
    createdAt: string
    updatedAt: string
    path: string
}

export type GoogleAuthConfig = {
    authType: "serviceAccount"
    jsonKey: string
}

export type GoogleStorageConfig = GoogleAuthConfig & {
    bucketName: string
}

export type AzureAuthConfig =
    | {
          authType: "connectionString"
          connectionString: string
      }
    | {
          authType: "sharedKey"
          accountName: string
          accountKey: string
      }
    | {
          authType: "aad"
          accountName: string
          tenantId: string
          clientId: string
          clientSecret: string
      }

export type AzureStorageConfig = AzureAuthConfig & {
    containerName: string
}

export interface S3ClientConfig {
    region: string
    accessKeyId: string
    secretAccessKey: string
    bucketName: string
}

export enum StorageType {
    AZURE = "AZURE",
    AWS = "AWS",
    GOOGLE = "GOOGLE"
}

export type IStorageAuth =
    | {
          type: StorageType.GOOGLE
          authConfig: GoogleStorageConfig
      }
    | {
          type: StorageType.AZURE
          authConfig: AzureStorageConfig
      }
    | {
          type: StorageType.AWS
          authConfig: S3ClientConfig
      }

export type CreateStorageDTO = IStorageAuth & {
    name: string
}

const ERROR_KEYS: Record<string, string> = {
    STORAGE_WRITE_FORBIDDEN: "storage.errors.write_forbidden",
    STORAGE_SECRET_REQUIRED: "storage.errors.secret_required"
}

const useStorageErrorMessage = () => {
    const { t } = useTranslation()
    return (error: Error): string | undefined => {
        const key = ERROR_KEYS[errorCodeOf(error) ?? ""]
        return key ? t(key) : undefined
    }
}

const useStorageApi = () => {
    const apiClient = useApiClient()
    const customErrorMessage = useStorageErrorMessage()

    const getMultiple = async (projectId: string): Promise<Storage[]> => {
        const response = await apiClient.doRequest<Storage[]>({
            url: `/api/projects/${projectId}/storages`
        })
        return response.data
    }

    const getSingle = async (id: string): Promise<Storage> => {
        const response = await apiClient.doRequest<Storage>({
            url: `/api/storages/${id}`
        })
        return response.data
    }

    const create = async (data: CreateStorageDTO): Promise<Storage> => {
        const response = await apiClient.doRequest<Storage>({
            url: "/api/storages",
            method: "POST",
            data,
            customErrorMessage
        })
        return response.data
    }

    const update = async (id: string, data: CreateStorageDTO): Promise<Storage> => {
        const response = await apiClient.doRequest<Storage>({
            url: `/api/storages/${id}`,
            method: "PUT",
            data,
            customErrorMessage
        })
        return response.data
    }

    const deleteSingle = async (id: string): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/storages/${id}`,
            method: "DELETE",
            customErrorMessage
        })
    }

    const setStorageAsDefault = async (storageId: string): Promise<Storage> => {
        const response = await apiClient.doRequest<Storage>({
            url: `/api/storages/${storageId}/default`,
            method: "PUT",
            customErrorMessage
        })
        return response.data
    }

    /** Writes, reads back and deletes a probe file with what the form holds, without saving it; `id` lends the stored credentials on an edit */
    const test = async (data: CreateStorageDTO, id?: string): Promise<ConnectionTestResult> => {
        const response = await apiClient.doRequest<ConnectionTestResult>({ url: id ? `/api/storages/${id}/test` : "/api/storages/test", method: "POST", data, customErrorMessage })
        return response.data
    }

    return {
        test,
        getMultiple,
        getSingle,
        create,
        update,
        deleteSingle,
        setStorageAsDefault
    }
}

export default useStorageApi
