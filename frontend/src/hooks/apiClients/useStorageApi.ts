import useApiClient from "../useApiClient"

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

const useStorageApi = () => {
    const apiClient = useApiClient()

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
            data
        })
        return response.data
    }

    const update = async (id: string, data: CreateStorageDTO): Promise<Storage> => {
        const response = await apiClient.doRequest<Storage>({
            url: `/api/storages/${id}`,
            method: "PUT",
            data
        })
        return response.data
    }

    const deleteSingle = async (id: string): Promise<void> => {
        await apiClient.doRequest({
            url: `/api/storages/${id}`,
            method: "DELETE"
        })
    }

    const setStorageAsDefault = async (storageId: string): Promise<Storage> => {
        const response = await apiClient.doRequest<Storage>({
            url: `/api/storages/${storageId}/default`,
            method: "PUT"
        })
        return response.data
    }

    return {
        getMultiple,
        getSingle,
        create,
        update,
        deleteSingle,
        setStorageAsDefault
    }
}

export default useStorageApi
