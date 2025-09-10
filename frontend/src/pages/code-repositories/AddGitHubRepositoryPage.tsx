import React, { useMemo, useEffect } from "react"
import { useForm, FormProvider } from "react-hook-form"
import { useNavigate, useParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import TextField from "@/components/input/TextField.rhf"
import SelectField from "@/components/input/SelectField.rhf"
import SinglePageLayout from "@/components/SinglePageLayout"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import { GitBranch } from "lucide-react"
import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"

interface GitHubConnectionForm {
    connectionName: string
    selectedOwner: string
    ownerType: 'personal' | 'organization'
}

interface OwnerOption {
    value: string
    label: string
    type: 'personal' | 'organization'
    icon?: string
}

const AddGitHubRepositoryPage: React.FC = () => {
    const navigate = useNavigate()
    const { id: repositoryId } = useParams<{ id: string }>()
    const { showSuccessNotification } = useToastNotificationStore()
    const { getGithubOrganizations, getGithubUser, updateRepositoryGithub, getRepositoryById } = useCodeRepositoriesApi()

    const form = useForm<GitHubConnectionForm>({
        defaultValues: {
            connectionName: "",
            selectedOwner: "",
            ownerType: 'personal'
        }
    })

    const repositoryQuery = useQuery({
        queryKey: ['repository', repositoryId],
        queryFn: () => getRepositoryById(repositoryId!),
        enabled: !!repositoryId,
    })

    const githubUserQuery = useQuery({
        queryKey: ['github-user', repositoryId],
        queryFn: () => getGithubUser(repositoryId!),
        enabled: !!repositoryId,
    })

    const githubOrganizationQuery = useQuery({
        queryKey: ['github-organizations', repositoryId],
        queryFn: async () => {
            const data = await getGithubOrganizations(repositoryId!)

            if (data.length === 0) {
                form.setValue('selectedOwner', 'personal')
                form.setValue('ownerType', 'personal')
            }

            return data;
        },
        enabled: !!repositoryId,
    })

    const {
        data: organizations,
    } = githubOrganizationQuery

    const {
        data: githubUser,
    } = githubUserQuery

    const ownerOptions = useMemo((): OwnerOption[] => {
        const options: OwnerOption[] = []

        // Add personal profile with real user data
        if (githubUser) {
            options.push({
                value: 'personal',
                label: githubUser.name || githubUser.login || 'Personal Profile',
                type: 'personal',
                icon: githubUser.avatar_url
            })
        } else {
            // Fallback while loading
            options.push({
                value: 'personal',
                label: 'Personal Profile',
                type: 'personal',
                icon: 'https://github.com/identicons/personal.png'
            })
        }

        // Add organizations
        if (organizations) {
            organizations.forEach(org => {
                options.push({
                    value: org.login,
                    label: org.name || org.login,
                    type: 'organization',
                    icon: org.avatar_url
                })
            })
        }

        return options
    }, [organizations, githubUser])

    // Pre-fill form with existing repository data
    useEffect(() => {
        const repository = repositoryQuery.data
        console.log(repository)
        if (repository?.githubData) {
            form.setValue('connectionName', repository.name || '')
            form.setValue('ownerType', repository.githubData.type || 'personal')
            
            if (repository.githubData.type === 'organization' && repository.githubData.organizationId) {
                form.setValue('selectedOwner', repository.githubData.organizationId)
            } else {
                form.setValue('selectedOwner', 'personal')
            }
        }
    }, [repositoryQuery.data, form])

    const onSubmit = async (data: GitHubConnectionForm) => {
        if(!repositoryId){
            return
        }

        await updateRepositoryGithub(repositoryId, {
            name: data.connectionName,
            type: data.selectedOwner === 'personal' ? 'personal' : 'organization',
            organizationId: data.selectedOwner !== 'personal' ? data.selectedOwner : undefined,
            
        })


        showSuccessNotification({
            message: `GitHub connection "${data.connectionName}" saved successfully`
        })
        navigate("/code-repositories")
    }


    if (!repositoryId) {
        return (
            <SinglePageLayout title="GitHub Connection">
                <Alert>
                    <AlertDescription>
                        Repository ID is required to configure GitHub connection.
                    </AlertDescription>
                </Alert>
            </SinglePageLayout>
        )
    }

    return (

        <SinglePageLayout title="GitHub Connection">
            <ApiDataFetcher<unknown, unknown> queries={[repositoryQuery, githubOrganizationQuery, githubUserQuery]}>
                <div className="max-w-2xl mx-auto">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center space-x-2">
                                <GitBranch className="h-6 w-6" />
                                <div>
                                    <CardTitle>GitHub Connection</CardTitle>
                                    <CardDescription>
                                        Configure your GitHub connection settings
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <FormProvider {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                                    <TextField
                                        name="connectionName"
                                        label="Connection Name"
                                        placeholder="Enter connection name"
                                        required
                                        rules={{
                                            required: "Connection name is required",
                                            minLength: {
                                                value: 3,
                                                message: "Connection name must be at least 3 characters"
                                            }
                                        }}
                                    />

                                    <div className="space-y-3">
                                        <label className="text-sm font-medium">Connection</label>
                                        {!organizations || organizations.length === 0 ? (
                                            <div className="space-y-2">
                                                <div className="flex items-center space-x-2 p-3 border rounded-md bg-muted">
                                                    <GitBranch className="h-4 w-4" />
                                                    <span className="text-sm">Personal Profile (auto-selected)</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    No organizations found. Using your personal GitHub profile.
                                                </p>
                                            </div>
                                        ) : organizations.length === 1 ? (
                                            <div className="space-y-3">
                                                <SelectField
                                                    name="selectedOwner"
                                                    placeholder="Select GitHub connection"
                                                    required
                                                    options={ownerOptions.map(option => ({
                                                        value: option.value,
                                                        label: option.label,
                                                        icon: option.icon
                                                    }))}
                                                    rules={{ required: "Please select a GitHub owner" }}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Choose between your personal profile or organization.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <SelectField
                                                    name="selectedOwner"
                                                    required
                                                    placeholder="Select GitHub owner"
                                                    options={ownerOptions.map(option => ({
                                                        value: option.value,
                                                        label: option.label,
                                                        icon: option.icon
                                                    }))}
                                                    rules={{ required: "Please select a GitHub owner" }}
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    Select from your personal profile or {organizations.length} organization{organizations.length > 1 ? 's' : ''}.
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end space-x-3 pt-4">
                                        <Button
                                            type="submit"
                                            disabled={form.formState.isSubmitting}
                                        >
                                            Save Connection
                                        </Button>
                                    </div>
                                </form>
                            </FormProvider>
                        </CardContent>
                    </Card>
                </div>

            </ApiDataFetcher>
        </SinglePageLayout>
    )
}

export default AddGitHubRepositoryPage