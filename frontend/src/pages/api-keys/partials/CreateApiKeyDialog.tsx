import { CopyButton, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useApiKeysApi from "@/hooks/apiClients/useApiKeysApi"
import useProjectStore from "@/store/useProjectStore"
import { ApiKeyFormData, CreateApiKeyFormInner } from "./CreateApiKeyForm"

interface CreateApiKeyDialogProps {
    isCreateDialogOpen: boolean
    setIsCreateDialogOpen: (open: boolean) => void
}

export const CreateApiKeyDialog: React.FC<CreateApiKeyDialogProps> = ({ isCreateDialogOpen, setIsCreateDialogOpen }) => {
    const { t } = useTranslation()
    const form = useForm<ApiKeyFormData>()
    const apiKeysApi = useApiKeysApi()
    const queryClient = useQueryClient()
    const project = useProjectStore()

    const createApiKeyMutation = useMutation({
        mutationFn: apiKeysApi.createApiKey,
        onSuccess: _data => {
            queryClient.invalidateQueries({ queryKey: ["api-keys", project.project?._id] })
        }
    })

    useEffect(() => {
        if (isCreateDialogOpen) {
            const defaultExpiration = new Date()
            defaultExpiration.setMonth(defaultExpiration.getMonth() + 6)
            form.reset({ name: "", expirationDate: defaultExpiration })
            createApiKeyMutation.reset()
        }
    }, [isCreateDialogOpen, createApiKeyMutation.reset, form.reset])

    const onSubmit = async (data: ApiKeyFormData) => {
        await createApiKeyMutation.mutateAsync({
            name: data.name,
            expiresAt: data.expirationDate.toISOString()
        })
    }

    const showSuccess = createApiKeyMutation.isSuccess

    return (
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogContent>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        {showSuccess ? (
                            <DialogHeader>
                                <DialogTitle>{t("apiKeys.created_api_key")}</DialogTitle>
                                <DialogDescription>{t("apiKeys.api_key_created_description")}</DialogDescription>
                            </DialogHeader>
                        ) : (
                            <DialogHeader>
                                <DialogTitle>{t("apiKeys.create_api_key")}</DialogTitle>
                                <DialogDescription>{t("apiKeys.create_api_key_description")}</DialogDescription>
                            </DialogHeader>
                        )}
                        {showSuccess ? (
                            <div className="my-4 space-y-2">
                                <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
                                    <code data-testid="api-key-value" className="flex-1 select-all break-all font-mono text-sm text-foreground">
                                        {createApiKeyMutation.data.apiKey}
                                    </code>
                                    <CopyButton value={createApiKeyMutation.data.apiKey} label={t("apiKeys.copy_to_clipboard")} copiedLabel={t("common.copied")} className="shrink-0" />
                                </div>
                                <p className="text-xs text-muted-foreground">{t("apiKeys.key_warning")}</p>
                            </div>
                        ) : (
                            <div className="py-4">
                                <CreateApiKeyFormInner />
                            </div>
                        )}

                        {showSuccess ? (
                            <DialogFooter>
                                <Button variant="secondary" type="button" onClick={() => setIsCreateDialogOpen(false)} disabled={form.formState.isSubmitting} dataTestId="api-key-close">
                                    {t("common.close")}
                                </Button>
                            </DialogFooter>
                        ) : (
                            <DialogFooter>
                                <Button variant="secondary" type="button" onClick={() => setIsCreateDialogOpen(false)} disabled={form.formState.isSubmitting}>
                                    {t("common.cancel")}
                                </Button>
                                <Button type="submit" disabled={form.formState.isSubmitting} dataTestId="api-key-submit">
                                    {t("apiKeys.create_key")}
                                </Button>
                            </DialogFooter>
                        )}
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}

export default CreateApiKeyDialog
