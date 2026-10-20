import { RadioGroup, RadioGroupItem } from "@mfe-orchestrator/design-system"
import { Controller, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { MicrofrontendKind } from "@/hooks/apiClients/useMicrofrontendsApi"
import { cn } from "@/utils/styleUtils"
import { KIND_DESCRIPTION_KEYS, KIND_LABEL_KEYS } from "../labels"

interface MicrofrontendKindFieldProps {
    /** Created under a parent: it can only be a MICROFRONTEND, so there is nothing to choose. */
    disabled?: boolean
    /** It already has parents, which a FRONTEND cannot have. */
    frontendDisabled?: boolean
}

/** The only place the kind is chosen: the template does not set it. */
export const MicrofrontendKindField: React.FC<MicrofrontendKindFieldProps> = ({ disabled, frontendDisabled }) => {
    const { t } = useTranslation()
    const { control } = useFormContext()

    return (
        <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">{t("microfrontend.kind.label")}</legend>
            <Controller
                control={control}
                name="kind"
                render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange} disabled={disabled} className="flex flex-wrap gap-3">
                        {Object.values(MicrofrontendKind).map(kind => {
                            const optionDisabled = disabled || (kind === MicrofrontendKind.FRONTEND && frontendDisabled)
                            return (
                                <label
                                    key={kind}
                                    htmlFor={`microfrontend-kind-${kind}`}
                                    className={cn(
                                        "flex flex-[1_1_240px] cursor-pointer items-start gap-3 rounded-md border-2 border-border p-3 transition-colors",
                                        field.value === kind && "border-primary bg-primary/5",
                                        optionDisabled && "cursor-not-allowed opacity-60"
                                    )}
                                >
                                    <RadioGroupItem id={`microfrontend-kind-${kind}`} value={kind} disabled={optionDisabled} className="mt-0.5" />
                                    <span className="min-w-0">
                                        <span className="block text-sm font-semibold">{t(KIND_LABEL_KEYS[kind])}</span>
                                        <span className="block text-xs text-foreground-secondary">{t(KIND_DESCRIPTION_KEYS[kind])}</span>
                                    </span>
                                </label>
                            )
                        })}
                    </RadioGroup>
                )}
            />
            {(disabled || frontendDisabled) && <p className="m-0 text-sm text-foreground-secondary">{t("microfrontend.kind.no_parents_hint")}</p>}
        </fieldset>
    )
}

export default MicrofrontendKindField
