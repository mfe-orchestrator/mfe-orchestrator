import { FormProvider, useForm } from "react-hook-form"
import TextField from "../input/TextField.rhf"
import { useTranslation } from "react-i18next";
import CalendarField from "../input/CalendarField.rhf";

export interface ApiKeyFormData {
    name: string;
    expirationDate: Date;
}

export const CreateApiKeyFormInner = () => {
    const { t } = useTranslation();
    return <div className="space-y-2">
        <TextField
            name="name"
            label={t('apiKeys.name')}
            placeholder={t('apiKeys.name_placeholder')}
        />
        <CalendarField
            name="expirationDate"
            label={t('apiKeys.expiresAt')}
            placeholder={t('apiKeys.expiresAt_placeholder')}
        />
    </div>
}

interface CreateApiKeyFormProps{
    onSubmit: (data: ApiKeyFormData) => Promise<void> | void;
    buttons?: React.ReactNode
}
const CreateApiKeyForm = ({ onSubmit: onSubmitCallback, buttons }: CreateApiKeyFormProps) => {

    const defaultExpiration = new Date()
    defaultExpiration.setMonth(defaultExpiration.getMonth() + 6)

    const form = useForm<ApiKeyFormData>({
        defaultValues: {
            expirationDate: defaultExpiration
        }
    })

    const onSubmit = (data: ApiKeyFormData) => {
        if (onSubmitCallback) return onSubmitCallback(data)
        
    }

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <CreateApiKeyFormInner />
                {buttons}
            </form>
        </FormProvider>
    )
}

export default CreateApiKeyForm
