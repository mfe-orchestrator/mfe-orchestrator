import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Form, SelectField, SwitchField } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import useAiModelsApi, {
    AiModelDetail,
    AiModelDTO,
    AVAILABLE_AI_MODELS_QUERY_KEY,
    aiModelInvalidDetailsOf,
    aiModelInvalidFieldMessage,
    LLM_PROVIDERS,
    LlmProvider,
    ORGANIZATION_AI_MODELS_QUERY_KEY,
    PROJECT_AI_ACCESS_QUERY_KEY,
    SECRET_PLACEHOLDER
} from "@/hooks/apiClients/useAiModelsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { LLM_EFFORTS, LlmEffort } from "@/types/ConfigResponseDTO"

/** The model the backend uses for Claude on Anthropic and on Azure AI Foundry when none is given. */
const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"

/** Where a stored secret is sent: the backend keeps one sent back as the placeholder only while none of these change. */
const DESTINATION_FIELDS = ["provider", "resource", "endpoint", "accessKeyId"] as const

/** A select item cannot carry an empty value: this one stands for "no limit". */
const NO_MAX_EFFORT = "none"

type ConfigField = "apiKey" | "resource" | "endpoint" | "region" | "accessKeyId" | "secretAccessKey"

/** Stored encrypted: the API sends them back as SECRET_PLACEHOLDER, and sending that back keeps them. */
const SECRET_FIELDS: ConfigField[] = ["apiKey", "secretAccessKey"]

/** What each provider needs, in the order the form asks for it; without a default model the model is required. */
const PROVIDER_FIELDS: Record<LlmProvider, { config: ConfigField[]; defaultModel?: string }> = {
    anthropic: { config: ["apiKey"], defaultModel: DEFAULT_CLAUDE_MODEL },
    "azure-foundry": { config: ["resource", "apiKey"], defaultModel: DEFAULT_CLAUDE_MODEL },
    gemini: { config: ["apiKey"] },
    "azure-openai": { config: ["endpoint", "apiKey"] },
    "aws-bedrock": { config: ["region", "accessKeyId", "secretAccessKey"] }
}

/** The fields the API can find fault with, by their name in the form. */
const TEXT_FIELDS = new Set<string>(["name", "model", "apiKey", "resource", "endpoint", "region", "accessKeyId", "secretAccessKey"])

type AiModelFormValues = Record<ConfigField, string> & {
    name: string
    provider: LlmProvider
    model: string
    reasoning: boolean
    maxEffort: LlmEffort | typeof NO_MAX_EFFORT
    isDefault: boolean
}

const configString = (config: Record<string, unknown> | undefined, key: ConfigField) => (typeof config?.[key] === "string" ? (config[key] as string) : "")

// The API sends the model in use, the default when none was saved: it stays in the field, the default is also its placeholder.
const toFormValues = (aiModel?: AiModelDetail): AiModelFormValues => ({
    name: aiModel?.name ?? "",
    provider: aiModel?.provider ?? "anthropic",
    model: aiModel?.model ?? "",
    apiKey: configString(aiModel?.config, "apiKey"),
    resource: configString(aiModel?.config, "resource"),
    endpoint: configString(aiModel?.config, "endpoint"),
    region: configString(aiModel?.config, "region"),
    accessKeyId: configString(aiModel?.config, "accessKeyId"),
    secretAccessKey: configString(aiModel?.config, "secretAccessKey"),
    reasoning: aiModel?.config.reasoning === true,
    maxEffort: aiModel?.maxEffort ?? NO_MAX_EFFORT,
    isDefault: aiModel?.isDefault ?? false
})

/** Only the fields of the chosen provider: those of another one typed before switching are left out. */
const toDTO = (values: AiModelFormValues, editing: boolean): AiModelDTO => {
    const { config: fields, defaultModel } = PROVIDER_FIELDS[values.provider]
    const config: Record<string, unknown> = Object.fromEntries(fields.map(field => [field, values[field].trim()]))
    if (values.provider === "azure-openai") config.reasoning = values.reasoning
    return {
        name: values.name.trim(),
        provider: values.provider,
        // Left empty where there is a default: a new AI leaves it out, an update clears the saved one with null.
        model: values.model.trim() || (defaultModel && editing ? null : undefined),
        config,
        // An update without the field would keep the limit: null is what takes it away.
        maxEffort: values.maxEffort === NO_MAX_EFFORT ? (editing ? null : undefined) : values.maxEffort,
        isDefault: values.isDefault
    }
}

/** Whether `destination` (the DESTINATION_FIELDS, in order) differs from where the stored `aiModel` sends its secrets. */
const pointsElsewhere = (destination: readonly (string | undefined)[], aiModel?: AiModelDetail): boolean => {
    if (!aiModel) return false
    const stored = toFormValues(aiModel)
    return DESTINATION_FIELDS.some((field, index) => (destination[index] ?? "").trim() !== stored[field])
}

/** The field of the form a path of the API body stands for. */
const formFieldOf = (path: string): keyof AiModelFormValues | undefined => {
    const field = path.replace(/^config\./, "")
    return TEXT_FIELDS.has(field) ? (field as keyof AiModelFormValues) : undefined
}

interface AiModelFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    organizationId: string
    /** The AI to edit; a new one when missing. */
    aiModel?: AiModelDetail
}

/** Adds an AI to the organization, or edits one: the fields follow the provider. */
export const AiModelFormDialog: React.FC<AiModelFormDialogProps> = ({ open, onOpenChange, organizationId, aiModel }) => {
    const { t } = useTranslation()
    const aiModelsApi = useAiModelsApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const form = useForm<AiModelFormValues>({ defaultValues: toFormValues(aiModel) })
    const provider = form.watch("provider")
    const { config: fields, defaultModel } = PROVIDER_FIELDS[provider]

    // Every opening starts from the AI it is opened on, or from a blank form.
    useEffect(() => {
        if (open) form.reset(toFormValues(aiModel))
    }, [open, aiModel, form])

    // The model of one provider means nothing to another one.
    useEffect(() => {
        const subscription = form.watch((_values, { name }) => {
            if (name === "provider") form.setValue("model", "")
        })
        return () => subscription.unsubscribe()
    }, [form])

    // A stored secret goes only where it was saved for (the backend refuses it elsewhere): pointing the AI to another
    // provider, resource, endpoint or access key empties the field and asks for it again.
    const watched = form.watch(DESTINATION_FIELDS)
    const destinationChanged = pointsElsewhere(watched, aiModel)
    useEffect(() => {
        // Read again from the form: opened on another AI, this render may still hold the values of the previous one.
        if (!destinationChanged || !pointsElsewhere(form.getValues([...DESTINATION_FIELDS]), aiModel)) return
        for (const field of SECRET_FIELDS) {
            if (form.getValues(field) === SECRET_PLACEHOLDER) form.setValue(field, "")
        }
    }, [destinationChanged, aiModel, form])

    const saveMutation = useMutation({
        mutationFn: (values: AiModelFormValues) => (aiModel ? aiModelsApi.update(organizationId, aiModel.id, toDTO(values, true)) : aiModelsApi.create(organizationId, toDTO(values, false))),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [ORGANIZATION_AI_MODELS_QUERY_KEY, organizationId] })
            queryClient.invalidateQueries({ queryKey: [PROJECT_AI_ACCESS_QUERY_KEY, organizationId] })
            queryClient.invalidateQueries({ queryKey: [AVAILABLE_AI_MODELS_QUERY_KEY] })
            notifications.showSuccessNotification({ message: t(aiModel ? "ai_models.updated" : "ai_models.created") })
            onOpenChange(false)
        },
        // The toast says it too: the field it is about shows it where it has to be fixed.
        onError: (error: Error) => {
            const details = aiModelInvalidDetailsOf(error)
            if (!details) return
            for (const path of details.missing ?? []) {
                const field = formFieldOf(path)
                if (field) form.setError(field, { message: t("validation.required") })
            }
            const field = details.field ? formFieldOf(details.field) : undefined
            const message = details.field ? aiModelInvalidFieldMessage(t, details) : undefined
            if (field && message) form.setError(field, { message })
        }
    })

    const required = { required: t("validation.required") }
    const providerOptions = LLM_PROVIDERS.map(value => ({ value, label: t(`ai_models.providers.${value}`) }))
    const effortOptions = [{ value: NO_MAX_EFFORT, label: t("ai_models.form.max_effort_none") }, ...LLM_EFFORTS.map(value => ({ value, label: t(`assistant.effort.levels.${value}`) }))]
    const isDeployment = provider === "azure-openai"

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(values => saveMutation.mutate(values))}>
                        <DialogHeader>
                            <DialogTitle>{t(aiModel ? "ai_models.form.edit_title" : "ai_models.form.add_title")}</DialogTitle>
                            <DialogDescription>{t("ai_models.form.description")}</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <TextField<AiModelFormValues>
                                name="name"
                                label={t("ai_models.form.name")}
                                placeholder={t("ai_models.form.name_placeholder")}
                                required
                                dataTestId="ai-model-name"
                                rules={{ ...required, maxLength: { value: 100, message: t("validation.max_length", { count: 100 }) } }}
                            />
                            {/* SelectField exposes no test id: the wrapper gives the tests a stable hook on the trigger. */}
                            <div data-testid="ai-model-provider">
                                <SelectField<AiModelFormValues> name="provider" label={t("ai_models.form.provider")} options={providerOptions} rules={required} />
                            </div>
                            {fields.map(field => (
                                <TextField<AiModelFormValues>
                                    key={`${provider}-${field}`}
                                    name={field}
                                    label={t(`ai_models.form.fields.${field}`)}
                                    placeholder={t(`ai_models.form.placeholders.${field}`)}
                                    type={SECRET_FIELDS.includes(field) ? "password" : "text"}
                                    description={SECRET_FIELDS.includes(field) && destinationChanged ? t("ai_models.form.secret_retype_hint") : undefined}
                                    autoComplete="off"
                                    required
                                    dataTestId={`ai-model-${field}`}
                                    rules={required}
                                />
                            ))}
                            <TextField<AiModelFormValues>
                                key={`${provider}-model`}
                                name="model"
                                label={t(isDeployment ? "ai_models.form.deployment" : "ai_models.form.model")}
                                placeholder={t(isDeployment ? "ai_models.form.placeholders.deployment" : `ai_models.form.placeholders.model_${provider}`)}
                                description={defaultModel ? t("ai_models.form.model_default_hint", { model: defaultModel }) : undefined}
                                required={!defaultModel}
                                dataTestId="ai-model-model"
                                rules={defaultModel ? undefined : required}
                            />
                            {isDeployment && <SwitchField<AiModelFormValues> name="reasoning" label={t("ai_models.form.reasoning")} description={t("ai_models.form.reasoning_hint")} />}
                            <div data-testid="ai-model-max-effort">
                                <SelectField<AiModelFormValues> name="maxEffort" label={t("ai_models.form.max_effort")} description={t("ai_models.form.max_effort_hint")} options={effortOptions} />
                            </div>
                            <SwitchField<AiModelFormValues> name="isDefault" label={t("ai_models.form.default")} description={t("ai_models.form.default_hint")} dataTestId="ai-model-default" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saveMutation.isPending}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" loading={saveMutation.isPending} loadingLabel={t("common.loading")} dataTestId="ai-model-save">
                                {t("common.save")}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

export default AiModelFormDialog
