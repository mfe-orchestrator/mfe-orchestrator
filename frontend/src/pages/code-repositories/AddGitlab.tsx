import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { CheckCircle2, ExternalLink, Eye, EyeOff, Info } from "lucide-react"
import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { z } from "zod"
import { Button } from "@/components/atoms"
import SelectField from "@/components/input/SelectField.rhf"
import TextField from "@/components/input/TextField.rhf"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useCodeRepositoriesApi, { AddRepositoryGitlabDTO, GitlabProject } from "@/hooks/apiClients/useCodeRepositoriesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"

const addGitlabFormSchema = z.object({
    name: z.string().min(1, "Name is required"),
    url: z.string().url("Must be a valid URL"),
    pat: z.string().min(1, "Personal Access Token is required"),
    groupPath: z.string().min(1, "Group path is required"),
    groupId: z.number().min(1, "Group Id is required")
})

type AddGitlabFormValues = z.infer<typeof addGitlabFormSchema>

type TestConnectionData = Pick<AddRepositoryGitlabDTO, "name" | "url" | "pat">

const AddGitlabRepositoryPage = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [showPat, setShowPat] = useState(false)
    const [error, setError] = useState("")
    const repositoryApi = useCodeRepositoriesApi()
    const params = useParams<{ id: string }>()
    const toast = useToastNotificationStore()

    const addRepositoryMutation = useMutation({
        mutationFn: repositoryApi.addRepositoryGitlab,
        onSuccess: () => {
            toast.showSuccessNotification({ message: t("codeRepositories.gitlab.success.added") })
            navigate("/code-repositories")
        },
        onError: (error: unknown) => {
            setError((error as Error)?.message || t("codeRepositories.gitlab.error.failedToAdd"))
        }
    })

    const editRepositoryMutation = useMutation({
        mutationFn: (data: AddRepositoryGitlabDTO) => repositoryApi.editRepositoryGitlab(params.id, data),
        onSuccess: () => {
            toast.showSuccessNotification({ message: t("codeRepositories.gitlab.success.edited") })
            navigate("/code-repositories")
        },
        onError: (error: unknown) => {
            setError((error as Error)?.message || t("codeRepositories.gitlab.error.failedToEdit"))
        }
    })

    useQuery({
        queryKey: ["getRepository", params.id],
        queryFn: async () => {
            const data = await repositoryApi.getRepositoryById(params.id)
            form.setValue("name", data.name)
            form.setValue("url", data.gitlabData?.url)
            form.setValue("pat", data.accessToken)
            if (data.gitlabData?.groupPath) {
                form.setValue("groupPath", data.gitlabData.groupPath)
                form.setValue("groupId", data.gitlabData.groupId)
                testConnectionMutation.mutateAsync({
                    name: data.name,
                    url: data.gitlabData.url,
                    pat: data.accessToken
                })
            }

            return data
        },
        enabled: !!params.id
    })

    const testConnectionMutation = useMutation({
        mutationFn: async (data: TestConnectionData) => {
            // Cast to full DTO with empty groupPath and groupId for test connection
            const testPayload: AddRepositoryGitlabDTO = {
                ...data,
                groupPath: "",
                groupId: ""
            }
            const out = await repositoryApi.testConnectionGitlab(testPayload)
            return out.sort((a, b) => a.full_name.localeCompare(b.full_name))
        },
        onError: (error: unknown) => {
            setError((error as Error)?.message || t("codeRepositories.gitlab.error.connectionFailed"))
        }
    })

    const handleSubmit = async (values: AddGitlabFormValues) => {
        if (params.id) {
            await editRepositoryMutation.mutateAsync(values as AddRepositoryGitlabDTO)
        } else {
            await addRepositoryMutation.mutateAsync(values as AddRepositoryGitlabDTO)
        }
    }

    const requiredScopes = [
        {
            scope: t("codeRepositories.gitlab.scopes.api.name"),
            description: t("codeRepositories.gitlab.scopes.api.description")
        },
        {
            scope: t("codeRepositories.gitlab.scopes.read_user.name"),
            description: t("codeRepositories.gitlab.scopes.read_user.description")
        },
        {
            scope: t("codeRepositories.gitlab.scopes.read_repository.name"),
            description: t("codeRepositories.gitlab.scopes.read_repository.description")
        }
    ]

    const form = useForm<AddGitlabFormValues>({
        resolver: zodResolver(addGitlabFormSchema),
        defaultValues: {
            url: "https://gitlab.com",
            name: "",
            pat: "",
            groupPath: "",
            groupId: ""
        }
    })

    console.log(form.getValues())
    console.log(form.formState.errors)

    return (
        <SinglePageLayout title={t("codeRepositories.gitlab.title")} description={t("codeRepositories.gitlab.description")}>
            <div className="container mx-auto py-6 max-w-4xl">
                <div className="grid gap-6 md:grid-cols-2">
                    <FormProvider {...form}>
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <img src="/img/GitLab.svg" alt="GitLab" className="h-8 w-8" />
                                    {t("codeRepositories.gitlab.connection")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                                    <div className="space-y-2">
                                        <TextField name="name" label={t("codeRepositories.gitlab.name")} placeholder={t("codeRepositories.gitlab.namePlaceholder")} required />
                                    </div>

                                    <div className="space-y-2">
                                        <TextField name="url" label={t("codeRepositories.gitlab.gitlabUrl")} placeholder={t("codeRepositories.gitlab.gitlabUrlPlaceholder")} required />
                                        <p className="text-sm text-muted-foreground">{t("codeRepositories.gitlab.gitlabUrlHelp")}</p>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="relative">
                                            <TextField
                                                name="pat"
                                                label={t("codeRepositories.gitlab.pat")}
                                                type={showPat ? "text" : "password"}
                                                placeholder={t("codeRepositories.gitlab.patPlaceholder")}
                                                required
                                            />
                                            <Button type="button" variant="ghost" size="sm" className="absolute right-0 bottom-0 pb-3 pt-3 pl-3 pr-3 min-w-0" onClick={() => setShowPat(!showPat)}>
                                                {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{t("codeRepositories.gitlab.patHelp")}</p>
                                    </div>

                                    {error && (
                                        <Alert variant="destructive">
                                            <AlertDescription>{error}</AlertDescription>
                                        </Alert>
                                    )}

                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="w-full"
                                        disabled={addRepositoryMutation.isPending || testConnectionMutation.isPending || editRepositoryMutation.isPending}
                                        onClick={() => {
                                            const { name, url, pat } = form.getValues()
                                            testConnectionMutation.mutateAsync({ name, url, pat })
                                        }}
                                    >
                                        {t("codeRepositories.gitlab.testConnection")}
                                    </Button>
                                    {testConnectionMutation.data && (
                                        <CardContent className="pt-4 border-t mt-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                <p className="text-sm font-medium text-green-600">{t("codeRepositories.gitlab.connectionSuccess")}</p>
                                            </div>
                                            <div className="mt-3">
                                                <SelectField
                                                    name="groupPath"
                                                    label={t("codeRepositories.gitlab.selectProject")}
                                                    placeholder={t("codeRepositories.gitlab.selectProjectPlaceholder")}
                                                    options={testConnectionMutation.data.map((project: GitlabProject) => ({
                                                        value: project.full_path,
                                                        label: project.full_name
                                                    }))}
                                                    required
                                                    onValueChange={value => {
                                                        const groupId = testConnectionMutation.data.find((project: GitlabProject) => project.full_path === value)?.id
                                                        if (!groupId) return
                                                        form.setValue("groupId", groupId.toString())
                                                    }}
                                                />
                                            </div>
                                        </CardContent>
                                    )}
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={
                                            !testConnectionMutation.data ||
                                            !form.watch("groupPath") ||
                                            addRepositoryMutation.isPending ||
                                            testConnectionMutation.isPending ||
                                            editRepositoryMutation.isPending
                                        }
                                    >
                                        {addRepositoryMutation.isPending || editRepositoryMutation.isPending
                                            ? params.id
                                                ? t("codeRepositories.gitlab.updating")
                                                : t("codeRepositories.gitlab.connecting")
                                            : params.id
                                              ? t("codeRepositories.gitlab.update")
                                              : t("codeRepositories.gitlab.connect")}
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
                                    {t("codeRepositories.gitlab.howToCreate")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-3">
                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-medium">1</div>
                                        <div>
                                            <p className="font-medium">{t("codeRepositories.gitlab.steps.step1.title")}</p>
                                            <p className="text-sm text-muted-foreground">{t("codeRepositories.gitlab.steps.step1.description")}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-medium">2</div>
                                        <div>
                                            <p className="font-medium">{t("codeRepositories.gitlab.steps.step2.title")}</p>
                                            <p className="text-sm text-muted-foreground">{t("codeRepositories.gitlab.steps.step2.description")}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-3">
                                        <div className="h-6 w-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-sm font-medium">3</div>
                                        <div>
                                            <p className="font-medium">{t("codeRepositories.gitlab.steps.step3.title")}</p>
                                            <p className="text-sm text-muted-foreground">{t("codeRepositories.gitlab.steps.step3.description")}</p>
                                        </div>
                                    </div>
                                </div>

                                <Button variant="secondary" size="sm" asChild className="w-full">
                                    <a href={form.watch("url") || "https://gitlab.com"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                                        {t("codeRepositories.gitlab.openGitlab")}
                                        <ExternalLink className="h-4 w-4" />
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t("codeRepositories.gitlab.requiredScopes")}</CardTitle>
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
                                    <AlertDescription className="text-sm">{t("codeRepositories.gitlab.scopesWarning")}</AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </SinglePageLayout>
    )
}

export default AddGitlabRepositoryPage
