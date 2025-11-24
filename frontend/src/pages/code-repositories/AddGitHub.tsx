import { useQuery } from "@tanstack/react-query"
import { GitBranch } from "lucide-react"
import React, { useEffect, useMemo } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import SelectField from "@/components/input/SelectField.rhf"
import TextField from "@/components/input/TextField.rhf"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"
import useCodeRepositoriesApi, { CodeRepositoryType } from "@/hooks/apiClients/useCodeRepositoriesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { GITHUB_SCOPES } from "./partials/utils"

interface GitHubConnectionForm {
    connectionName: string
    selectedOwner: string
    ownerType: CodeRepositoryType
}

interface OwnerOption {
    value: string
    label: string
    type: CodeRepositoryType
    icon?: string
}

const AddGitHubRepositoryPage: React.FC = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { id: repositoryId } = useParams<{ id: string }>()
    const { showSuccessNotification } = useToastNotificationStore()
    const [searchParams] = useSearchParams()
    const globalParameters = useGlobalParameters()
    const githubClientId = globalParameters.getParameter("codeRepository.github.clientId")
    const isNew = searchParams.get("isNew") === "true"
    const { getGithubOrganizations, getGithubUser, updateRepositoryGithub, getRepositoryById } = useCodeRepositoriesApi()

    const form = useForm<GitHubConnectionForm>({
        defaultValues: {
            connectionName: "",
            selectedOwner: "",
            ownerType: CodeRepositoryType.PERSONAL
        }
    })

    const onUpdateGithubPage = () => {
        // Redirect to GitHub OAuth for SSO access
        const redirectUri = `${window.location.origin}/code-repositories/callback/github?codeRepositoryId=${repositoryId}`

        const state = btoa(
            JSON.stringify({
                provider: "github",
                timestamp: Date.now()
            })
        )

        // Force GitHub to show authorization page by adding allow_signup=true
        // Note: To truly force re-authorization, users need to revoke the app from GitHub settings
        const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${GITHUB_SCOPES}&state=${state}&prompt=login`

        // Open GitHub auth in current window
        window.location.href = githubAuthUrl
        return
    }

    const repositoryQuery = useQuery({
        queryKey: ["repository", repositoryId],
        queryFn: () => getRepositoryById(repositoryId!, { silent: true }),
        retry: 1,
        enabled: !!repositoryId
    })

    const githubUserQuery = useQuery({
        queryKey: ["github-user", repositoryId],
        queryFn: () => getGithubUser(repositoryId!, { silent: true }),
        retry: 1,
        enabled: !!repositoryId
    })

    const githubOrganizationQuery = useQuery({
        queryKey: ["github-organizations", repositoryId],
        retry: 1,
        queryFn: async () => {
            const data = await getGithubOrganizations(repositoryId!, { silent: true })

            if (data.length === 0) {
                form.setValue("selectedOwner", CodeRepositoryType.PERSONAL)
                form.setValue("ownerType", CodeRepositoryType.PERSONAL)
            }

            return data
        },
        enabled: !!repositoryId
    })

    const { data: organizations } = githubOrganizationQuery

    const { data: githubUser } = githubUserQuery

    const ownerOptions = useMemo((): OwnerOption[] => {
        const options: OwnerOption[] = []

        // Add personal profile with real user data
        if (githubUser) {
            options.push({
                value: CodeRepositoryType.PERSONAL,
                label: githubUser.name || githubUser.login || t("codeRepositories.github.personalProfile"),
                type: CodeRepositoryType.PERSONAL,
                icon: githubUser.avatar_url
            })
        } else {
            // Fallback while loading
            options.push({
                value: CodeRepositoryType.PERSONAL,
                label: t("codeRepositories.github.personalProfile"),
                type: CodeRepositoryType.PERSONAL,
                icon: "https://github.com/identicons/personal.png"
            })
        }

        // Add organizations
        if (organizations) {
            organizations.forEach(org => {
                options.push({
                    value: org.login,
                    label: org.name || org.login,
                    type: CodeRepositoryType.ORGANIZATION,
                    icon: org.avatar_url
                })
            })
        }

        return options
    }, [organizations, githubUser, t])

    // Pre-fill form with existing repository data
    useEffect(() => {
        const repository = repositoryQuery.data
        console.log(repository)
        if (repository?.githubData) {
            form.setValue("connectionName", repository.name || "")
            form.setValue("ownerType", repository.githubData.type || CodeRepositoryType.PERSONAL)

            if (repository.githubData.type === CodeRepositoryType.ORGANIZATION && repository.githubData.organizationId) {
                form.setValue("selectedOwner", repository.githubData.organizationId)
            } else {
                form.setValue("selectedOwner", CodeRepositoryType.PERSONAL)
            }
        }
    }, [repositoryQuery.data, form])

    const onSubmit = async (data: GitHubConnectionForm) => {
        if (!repositoryId) {
            return
        }

        await updateRepositoryGithub(repositoryId, {
            name: data.connectionName,
            type: data.selectedOwner !== CodeRepositoryType.PERSONAL ? CodeRepositoryType.ORGANIZATION : CodeRepositoryType.PERSONAL,
            organizationId: data.selectedOwner !== CodeRepositoryType.PERSONAL ? data.selectedOwner : undefined,
            userName: data.selectedOwner === CodeRepositoryType.PERSONAL ? githubUserQuery.data.login : undefined
        })

        showSuccessNotification({
            message: t("codeRepositories.github.connectionSaved", { name: data.connectionName })
        })
        navigate("/code-repositories")
    }

    if (!repositoryId) {
        return (
            <SinglePageLayout title={t("codeRepositories.github.title")}>
                <Alert>
                    <AlertDescription>{t("codeRepositories.github.repositoryIdRequired")}</AlertDescription>
                </Alert>
            </SinglePageLayout>
        )
    }

    const isError = repositoryQuery.isError || githubOrganizationQuery.isError || githubUserQuery.isError

    return (
        <SinglePageLayout title={t("codeRepositories.github.title")}>
            <ApiDataFetcher queries={[repositoryQuery, githubOrganizationQuery, githubUserQuery]} interceptError={false}>
                <div className="max-w-2xl mx-auto">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center space-x-2">
                                <GitBranch className="h-6 w-6" />
                                <div>
                                    <CardTitle>{t("codeRepositories.github.title")}</CardTitle>
                                    <CardDescription>{t("codeRepositories.github.description")}</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {!isNew && (
                                <div className="mb-4 mt-2  p-4 bg-muted rounded-lg">
                                    <div className="flex items-center space-x-4 justify-between">
                                        <div>
                                            <h3 className="text-sm font-medium">{t("codeRepositories.github.githubAccessTitle")}</h3>
                                            <p className="text-xs text-muted-foreground">{t("codeRepositories.github.githubAccessDescription")}</p>
                                        </div>
                                        <Button type="button" variant="secondary" onClick={onUpdateGithubPage}>
                                            {t("codeRepositories.github.updateGithubAccess")}
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {isError ? (
                                <Alert variant="destructive">
                                    <AlertDescription>{t("codeRepositories.github.error")}</AlertDescription>
                                </Alert>
                            ) : (
                                <FormProvider {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-2">
                                        <TextField
                                            name="connectionName"
                                            label={t("codeRepositories.github.connectionName")}
                                            placeholder={t("codeRepositories.github.connectionNamePlaceholder")}
                                            required
                                            rules={{
                                                required: t("codeRepositories.github.connectionNameRequired"),
                                                minLength: {
                                                    value: 3,
                                                    message: t("codeRepositories.github.connectionNameMinLength")
                                                }
                                            }}
                                        />

                                        <div className="space-y-3">
                                            <label className="text-sm font-medium">{t("codeRepositories.github.connection")}</label>
                                            {!organizations || organizations.length === 0 ? (
                                                <div className="space-y-2">
                                                    <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted">
                                                        <GitBranch className="h-4 w-4" />
                                                        <span className="text-sm">{t("codeRepositories.github.personalProfileAutoSelected")}</span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground">{t("codeRepositories.github.noOrganizationsFound")}</p>
                                                </div>
                                            ) : organizations.length === 1 ? (
                                                <div className="space-y-3">
                                                    <SelectField
                                                        name="selectedOwner"
                                                        placeholder={t("codeRepositories.github.selectConnection")}
                                                        required
                                                        options={ownerOptions.map(option => ({
                                                            value: option.value,
                                                            label: option.label,
                                                            icon: option.icon
                                                        }))}
                                                        rules={{ required: t("codeRepositories.github.selectOwnerRequired") }}
                                                    />
                                                    <p className="text-xs text-muted-foreground">{t("codeRepositories.github.chooseProfileOrOrg")}</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <SelectField
                                                        name="selectedOwner"
                                                        required
                                                        placeholder={t("codeRepositories.github.selectOwner")}
                                                        options={ownerOptions.map(option => ({
                                                            value: option.value,
                                                            label: option.label,
                                                            icon: option.icon
                                                        }))}
                                                        rules={{ required: t("codeRepositories.github.selectOwnerRequired") }}
                                                    />
                                                    <p className="text-xs text-muted-foreground">{t("codeRepositories.github.selectFromOptions", { count: organizations.length })}</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex justify-end space-x-3 pt-4">
                                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                                {t("codeRepositories.github.saveConnection")}
                                            </Button>
                                        </div>
                                    </form>
                                </FormProvider>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </ApiDataFetcher>
        </SinglePageLayout>
    )
}

export default AddGitHubRepositoryPage
