import { useEffect } from "react"
import { FormProvider, useForm, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import TextField from "@/components/input/TextField.rhf"
import { Button } from "@/components/ui/button/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useGlobalVariablesApi, { GlobalVariableCreateDTO } from "@/hooks/apiClients/useGlobalVariablesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface EnvironmentVariableDialogProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    initialValues: GlobalVariableCreateDTO | null
    environments: EnvironmentDTO[]
    onSubmitSuccess?: () => void | Promise<void>
}

export function EnvironmentVariableDialog({ onSubmitSuccess, isOpen, onOpenChange, initialValues, environments }: EnvironmentVariableDialogProps) {
    const { t } = useTranslation()
    const globalVariablesApi = useGlobalVariablesApi()
    const notifications = useToastNotificationStore()
    const form = useForm({
        defaultValues: initialValues
    })
    const isEditing = Boolean(initialValues?.key)

    const onSubmit = async (data: GlobalVariableCreateDTO) => {
        if (initialValues.key) {
            await globalVariablesApi.update({
                originalKey: initialValues.key,
                ...data
            })
            notifications.showSuccessNotification({
                message: t("environmentVariables.updated_success")
            })
        } else {
            await globalVariablesApi.create(data)
            notifications.showSuccessNotification({
                message: t("environmentVariables.created_success")
            })
        }

        await onSubmitSuccess?.()
        onOpenChange(false)
    }
    const { values } = useWatch<GlobalVariableCreateDTO>({
        control: form.control
    })

    useEffect(() => {
        if (isOpen) {
            form.reset(initialValues)
        }
    }, [initialValues, isOpen, form.reset])

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEditing ? t("environmentVariables.editVariable") : t("environmentVariables.addVariable")}</DialogTitle>
                </DialogHeader>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <TextField name="key" label={t("environmentVariables.key")} required />

                        {values &&
                            values.map((envValue, index) => (
                                <TextField name={"values." + index + ".value"} label={environments.find(e => e._id === envValue.environmentId)?.name || envValue.environmentId} />
                            ))}

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {isEditing ? t("common.save") : t("common.create")}
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}
