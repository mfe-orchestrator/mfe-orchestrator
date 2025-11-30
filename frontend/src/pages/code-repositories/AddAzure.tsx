import { useMutation, useQuery } from "@tanstack/react-query"
import { CheckCircle2, ExternalLink, Eye, EyeOff, Info } from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { Button } from "@/components/atoms"
import SelectField from "@/components/input/SelectField.rhf"
import TextField from "@/components/input/TextField.rhf"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface AddAzureFormValues {
    organization: string
    pat: string
    name: string
    projectId: string
}

const AddAzureRepositoryPage = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [showPat, setShowPat] = useState(false)
    const repositoryApi = useCodeRepositoriesApi()
    const notificationStore = useToastNotificationStore()
    const params = useParams<{ id: string }>()

    useQuery({
        queryKey: ["getRepository", params.id],
        queryFn: async () => {
            const data = await repositoryApi.getRepositoryById(params.id)
            form.setValue("organization", data.azureData?.organization)
            form.setValue("pat", data.accessToken)
            form.setValue("name", data.name)
            form.setValue("projectId", data.azureData?.projectId)
            if (data.azureData?.projectId) {
                testConnectionMutation.mutateAsync({
                    organization: data.azureData.organization,
                    pat: data.accessToken
                })
            }
        },
        enabled: !!params.id
    })

    const testConnectionMutation = useMutation({
        mutationFn: repositoryApi.testConnectionAzure
    })

    const handleSubmit = async (values: AddAzureFormValues) => {
        const realValues = {
            ...values,
            projectName: testConnectionMutation.data?.value.find(project => project.id === values.projectId)?.name
        }
        if (params.id) {
            await repositoryApi.editRepositoryAzure(params.id, realValues)
            notificationStore.showSuccessNotification({
                message: t("codeRepositories.azure.successEdit")
            })
        } else {
            await repositoryApi.addRepositoryAzure(realValues)
            notificationStore.showSuccessNotification({
                message: t("codeRepositories.azure.successAdd")
            })
        }
        navigate("/code-repositories")
    }

    const requiredScopes = [
        {
            scope: t("codeRepositories.azure.scopes.code.name"),
            description: t("codeRepositories.azure.scopes.code.description")
        },
        {
            scope: t("codeRepositories.azure.scopes.build.name"),
            description: t("codeRepositories.azure.scopes.build.description")
        },
        {
            scope: t("codeRepositories.azure.scopes.release.name"),
            description: t("codeRepositories.azure.scopes.release.description")
        },
        {
            scope: t("codeRepositories.azure.scopes.variableGroups.name"),
            description: t("codeRepositories.azure.scopes.variableGroups.description")
        }
    ]

    const form = useForm<AddAzureFormValues>()

    return (
        <SinglePageLayout title={t("codeRepositories.azure.title")} description={t("codeRepositories.azure.description")}>
            <div className="container mx-auto py-6 max-w-4xl">
                <div className="grid gap-6 md:grid-cols-2">
                    {/* PAT Form */}
                    <FormProvider {...form}>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <img src="/img/AzureDevOps.svg" alt="Azure DevOps" className="h-8 w-8" />
                                    {t("codeRepositories.azure.connection")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                                    <div className="space-y-2">
                                        <TextField name="name" label={t("codeRepositories.azure.name")} placeholder={t("codeRepositories.azure.namePlaceholder")} required />
                                        <TextField
                                            name="organization"
                                            label={t("codeRepositories.azure.organizationName")}
                                            placeholder={t("codeRepositories.azure.organizationPlaceholder")}
                                            required
                                        />
                                        <p className="text-sm text-muted-foreground">{t("codeRepositories.azure.organizationHelp")}</p>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="relative">
                                            <TextField
                                                name="pat"
                                                label={t("codeRepositories.azure.pat")}
                                                type={showPat ? "text" : "password"}
                                                placeholder={t("codeRepositories.azure.patPlaceholder")}
                                                required
                                            />
                                            <Button type="button" variant="ghost" size="sm" className="absolute right-0 bottom-0 pb-3 pt-3 pl-3 pr-3 min-w-0" onClick={() => setShowPat(!showPat)}>
                                                {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{t("codeRepositories.azure.patHelp")}</p>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="w-full"
                                        disabled={form.formState.isSubmitting || testConnectionMutation.isPending}
                                        onClick={() => testConnectionMutation.mutateAsync(form.getValues())}
                                    >
                                        {t("codeRepositories.azure.testConnection")}
                                    </Button>
                                    {testConnectionMutation.data && (
                                        <CardContent className="pt-4 border-t mt-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                <p className="text-sm font-medium text-green-600">{t("codeRepositories.gitlab.connectionSuccess")}</p>
                                            </div>
                                            <p className="text-sm text-muted-foreground mb-2">
                                                {t("codeRepositories.azure.projectsFound", {
                                                    count: testConnectionMutation.data.value.length
                                                })}
                                                :
                                            </p>
                                            <div className="mt-3">
                                                <SelectField
                                                    name="projectId"
                                                    label={t("codeRepositories.gitlab.selectProject")}
                                                    placeholder={t("codeRepositories.gitlab.selectProjectPlaceholder")}
                                                    options={testConnectionMutation.data.value.map(project => ({
                                                        value: project.id.toString(),
                                                        label: project.name
                                                    }))}
                                                    required
                                                />
                                            </div>
                                        </CardContent>
                                    )}
                                    <Button type="submit" className="w-full" disabled={!testConnectionMutation.data || form.formState.isSubmitting || testConnectionMutation.isPending}>
                                        {form.formState.isSubmitting ? t("codeRepositories.azure.connecting") : t("codeRepositories.azure.connect")}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </FormProvider>

                    {/* Instructions */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Info className="h-5 w-5" />
                                    {t("codeRepositories.azure.howToCreate")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">1</div>
                                        <div>
                                            <p className="font-medium">{t("codeRepositories.azure.steps.step1.title")}</p>
                                            <p className="text-sm text-muted-foreground">{t("codeRepositories.azure.steps.step1.description")}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">2</div>
                                        <div>
                                            <p className="font-medium">{t("codeRepositories.azure.steps.step2.title")}</p>
                                            <p className="text-sm text-muted-foreground">{t("codeRepositories.azure.steps.step2.description")}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">3</div>
                                        <div>
                                            <p className="font-medium">{t("codeRepositories.azure.steps.step3.title")}</p>
                                            <p className="text-sm text-muted-foreground">{t("codeRepositories.azure.steps.step3.description")}</p>
                                        </div>
                                    </div>
                                </div>

                                <Button variant="secondary" size="sm" asChild className="w-full">
                                    <a href="https://dev.azure.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                        {t("codeRepositories.azure.openAzureDevOps")}
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t("codeRepositories.azure.requiredScopes")}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {requiredScopes.map((scope, index) => (
                                        <div key={index} className="flex items-start gap-3">
                                            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                            <div>
                                                <p className="font-medium text-sm">{scope.scope}</p>
                                                <p className="text-xs text-muted-foreground">{scope.description}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Alert className="mt-4">
                                    <Info className="h-4 w-4" />
                                    <AlertDescription className="text-sm">{t("codeRepositories.azure.scopesWarning")}</AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </SinglePageLayout>
    )
}

export default AddAzureRepositoryPage
