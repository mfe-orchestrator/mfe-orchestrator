import { Card, CardContent, CardDescription, CardHeader, CardTitle, DescriptionItem, DescriptionList } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import useUserApi, { User } from "@/hooks/apiClients/useUserApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import useUserStore from "@/store/useUserStore"

interface FormValues {
    name: string
    surname: string
}

interface PersonalDataSectionProps {
    user: User
}

export const PersonalDataSection: React.FC<PersonalDataSectionProps> = ({ user }) => {
    const { t } = useTranslation()
    const { updateProfile } = useUserApi()
    const { setUser } = useUserStore()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()

    const form = useForm<FormValues>({
        defaultValues: {
            name: user.name ?? "",
            surname: user.surname ?? ""
        }
    })

    const updateProfileMutation = useMutation({
        mutationFn: updateProfile,
        onSuccess: updated => {
            setUser(updated)
            // Il profilo si aggiorna scrivendo direttamente in cache invece di
            // invalidare: la query `["profile"]` sta dentro AuthWrapper, che
            // durante il refetch mostra il loader al posto di tutta
            // l'applicazione.
            queryClient.setQueryData(["profile"], updated)
            form.reset({ name: updated.name ?? "", surname: updated.surname ?? "" })
            notifications.showSuccessNotification({ message: t("profile.notifications.personalDataUpdated") })
        }
    })

    const onSubmit = (values: FormValues) => updateProfileMutation.mutateAsync(values)

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("profile.personalData.title")}</CardTitle>
                <CardDescription>{t("profile.personalData.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DescriptionList className="mb-4">
                            <DescriptionItem label={t("profile.personalData.email")} hint={t("profile.personalData.emailNotEditable")}>
                                {/* Il testid resta sul valore: l'asserzione e2e confronta il testo con la sola email */}
                                <span className="break-all" data-testid="profile-email">
                                    {user.email}
                                </span>
                            </DescriptionItem>
                        </DescriptionList>

                        <div className="flex flex-wrap gap-4">
                            <TextField<FormValues>
                                name="name"
                                label={t("profile.personalData.name")}
                                id="profile-name"
                                dataTestId="profile-name"
                                containerClassName="flex-[1_1_200px]"
                                rules={{
                                    maxLength: {
                                        value: 100,
                                        message: t("validation.max_length", { count: 100 })
                                    }
                                }}
                            />
                            <TextField<FormValues>
                                name="surname"
                                label={t("profile.personalData.surname")}
                                id="profile-surname"
                                dataTestId="profile-surname"
                                containerClassName="flex-[1_1_200px]"
                                rules={{
                                    maxLength: {
                                        value: 100,
                                        message: t("validation.max_length", { count: 100 })
                                    }
                                }}
                            />
                        </div>

                        <Button type="submit" className="mt-5" disabled={updateProfileMutation.isPending || !form.formState.isDirty} dataTestId="profile-save">
                            {updateProfileMutation.isPending ? t("common.saving") : t("common.save")}
                        </Button>
                    </form>
                </FormProvider>
            </CardContent>
        </Card>
    )
}

export default PersonalDataSection
