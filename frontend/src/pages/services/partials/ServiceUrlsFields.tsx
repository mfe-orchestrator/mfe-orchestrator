import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { FieldError, get, useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import TextField from "@/components/input/TextField.rhf"
import type { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"

/** Where the service is exposed: a base URL per environment, blank where it is not. */
export const ServiceUrlsFields: React.FC<{ environments: EnvironmentDTO[] }> = ({ environments }) => {
    const { t } = useTranslation()
    const {
        formState: { errors }
    } = useFormContext()

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0">{t("services.urls.title")}</CardTitle>
                <CardDescription>{t("services.urls.description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-4 gap-y-2 pt-3">
                {environments.length === 0 && <p className="text-sm text-foreground-secondary">{t("services.urls.no_environments")}</p>}
                {environments.map((environment, index) => {
                    // The design system TextField looks errors up by the flat name, which misses one inside a list
                    const error = get(errors, `urls.${index}`) as FieldError | undefined

                    return (
                        <div key={environment._id} className="flex flex-[1_1_280px] flex-col gap-1">
                            <TextField name={`urls.${index}`} label={environment.name} placeholder={t("services.urls.placeholder")} autoComplete="off" inputMode="url" />
                            {error?.message && (
                                <p role="alert" className="text-sm font-medium text-destructive">
                                    {error.message}
                                </p>
                            )}
                        </div>
                    )
                })}
            </CardContent>
        </Card>
    )
}

export default ServiceUrlsFields
