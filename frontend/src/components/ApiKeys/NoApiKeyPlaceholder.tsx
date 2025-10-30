import { Button } from "../ui/button/button"
import CreateApiKeyForm, { ApiKeyFormData } from "./CreateApiKeyForm"
import { useTranslation } from "react-i18next"
import useApiKeysApi from "@/hooks/apiClients/useApiKeysApi"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import useProjectStore from "@/store/useProjectStore"

const NoApiKeyPlaceholder: React.FC = () => {

    const apiKeysApi = useApiKeysApi()
    const queryClient = useQueryClient()
    const project = useProjectStore()
    const { t } = useTranslation()

    const createApiKeyMutation = useMutation({
        mutationFn: apiKeysApi.createApiKey,
    })

    const onOk = () =>{
        queryClient.invalidateQueries({ queryKey: ["api-keys", project.project?._id] })
    }


    const onSubmit = async (data: ApiKeyFormData) => {
        await createApiKeyMutation.mutateAsync({
            name: data.name,
            expiresAt: data.expirationDate.toISOString()
        })
    }

    const showSuccess = createApiKeyMutation.isSuccess

    if(showSuccess){
        return (
            <div className="flex flex-col items-center justify-center p-6">
                <h3 className="text-lg font-semibold mb-2">{t("apiKeys.api_key_created")}</h3>
                <p className="text-muted-foreground mb-4 text-center">{t("apiKeys.api_key_created_description")}</p>
                
                <div className="mt-4 py-4 bg-gray-50 dark:bg-gray-800 rounded-md w-full max-w-md">
                    <div className="flex items-center justify-between">
                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded text-sm flex-1 mr-2 break-all">
                            {createApiKeyMutation.data?.apiKey}
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                if (createApiKeyMutation.data?.apiKey) {
                                    navigator.clipboard.writeText(createApiKeyMutation.data.apiKey)
                                }
                            }}
                            className="ml-2 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0"
                            title="Copy to clipboard"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div className="mt-6">
                    <Button onClick={onOk}>
                        {t("common.ok")}
                    </Button>
                </div>
            </div>
        )
    }
    
    return (
        <div className="flex flex-col items-center justify-center py-4">
            <p className="text-center pb-4 text-muted-foreground">{t('apiKeys.no_api_keys')}</p>
            <CreateApiKeyForm
                buttons={
                    <div className="flex justify-center mt-4">
                        <Button type="submit">
                            {t("apiKeys.create_key")}
                        </Button>
                    </div>
                }
                onSubmit={onSubmit} />
        </div>
    )
}

export default NoApiKeyPlaceholder
