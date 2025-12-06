import { useMutation, useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import SelectField from "../../../../components/input/SelectField.rhf"
import Switch from "../../../../components/input/Switch.rhf"
import TextField from "../../../../components/input/TextField.rhf"
import { Alert, AlertDescription } from "../../../../components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card"
import useCodeRepositoriesApi, { ICodeRepository, Repository } from "../../../../hooks/apiClients/useCodeRepositoriesApi"

const logoMap: Record<string, string> = {
    GITHUB: "/img/GitHub.svg",
    GITLAB: "/img/GitLab.svg",
    AZURE_DEV_OPS: "/img/AzureDevOps.svg",
    AWS: "/img/aws.svg",
    GOOGLE: "/img/GoogleCloud.svg",
    AZURE: "/img/Azure.svg"
}

interface CodeRepositorySectionProps {
    repositoriesData: ICodeRepository[]
    isEdit?: boolean
    forceCreation?: boolean
}

interface RepositoryNameAvailability {
    checking: boolean
    available: boolean | null
    error: string | null
}

export const CodeRepositorySection: React.FC<CodeRepositorySectionProps> = ({ repositoriesData, isEdit = false, forceCreation = false }) => {
    const { t } = useTranslation()
    const { watch, setValue } = useFormContext()
    const codeRepositoriesApi = useCodeRepositoriesApi()

    // Watch form values
    const codeRepositoryEnabled = watch("codeRepository.enabled")
    const selectedCodeRepositoryId = watch("codeRepository.codeRepositoryId")
    const selectedRepositoryId = watch("codeRepository.repositoryId")
    const selectedGroupPath = watch("codeRepository.gitlab.groupPath")
    const selectedGroupId = watch("codeRepository.gitlab.groupId")
    const selectedRepositoryName = watch("codeRepository.createData.name")

    // Local state
    const [repositoryNameAvailability, setRepositoryNameAvailability] = useState<RepositoryNameAvailability>({
        checking: false,
        available: null,
        error: null
    })
    const [fetchedRepositories, setFetchedRepositories] = useState<Repository[]>([])

    // GitLab groups query
    const gitlabGroupsQuery = useQuery({
        queryKey: ["gitlabGroups", selectedCodeRepositoryId],
        queryFn: async () => {
            const out = await codeRepositoriesApi.getGitlabGroups(selectedCodeRepositoryId!)
            if (out.length > 1) {
                setValue("codeRepository.gitlab.groupId", out?.[0].full_path)
            }
            return out
        },
        enabled: !!selectedCodeRepositoryId && repositoriesData?.find(repo => repo._id === selectedCodeRepositoryId)?.provider === "GITLAB"
    })

    // Fetch repositories mutation
    const fetchRepositoriesMutation = useMutation({
        mutationFn: async (codeRepositoryId: string) => {
            const response = await codeRepositoriesApi.getRepositories({ repositoryId: codeRepositoryId, silent: true })
            return response
        },
        onSuccess: data => {
            setFetchedRepositories(data || [])
        }
    })

    // Function to fetch repositories when code repository is selected
    const fetchRepository = async () => {
        if (forceCreation) {
            setValue("codeRepository.repositoryId", "create_new")
            return
        }

        if (selectedCodeRepositoryId && codeRepositoryEnabled) {
            const data = await fetchRepositoriesMutation.mutateAsync(selectedCodeRepositoryId)
            const repository = data.find(repo => repo.name === selectedRepositoryId || String(repo.id) === selectedRepositoryId)
            if (!repository) {
                setValue("codeRepository.repositoryId", "")
            }
        } else {
            setFetchedRepositories([])
        }
    }

    // Effect to fetch repositories when a repository is selected
    useEffect(() => {
        fetchRepository()
    }, [selectedCodeRepositoryId])

    // Repository name availability check
    const onDebounceRepository = async (repositoryName: string) => {
        checkAvailability(repositoryName, selectedGroupPath, selectedGroupId)
    }

    const checkAvailability = async (repositoryName: string, selectedGroupPath?: string, selectedGroupId?: number) => {
        if (!selectedCodeRepositoryId) return
        if (!repositoryName || !selectedRepositoryId || repositoryName.length < 3) {
            setRepositoryNameAvailability({ checking: false, available: null, error: null })
            return
        }
        setRepositoryNameAvailability({ checking: true, available: null, error: null })

        try {
            const result = await codeRepositoriesApi.checkRepositoryNameAvailability(selectedCodeRepositoryId, repositoryName, selectedGroupPath, selectedGroupId)
            setRepositoryNameAvailability({
                checking: false,
                available: result,
                error: null
            })
        } catch (error) {
            setRepositoryNameAvailability({
                checking: false,
                available: null,
                error: error instanceof Error ? error.message : t("app.error.generic")
            })
        }
    }

    // Don't render if no repositories available
    if (!repositoriesData || repositoriesData.length === 0) {
        return null
    }

    return (
        <Card>
            <CardHeader className={!codeRepositoryEnabled ? "border-b-0 pb-0" : ""}>
                <div className="flex items-end justify-between flex-wrap gap-x-4 gap-y-2">
                    <div>
                        <CardTitle className="mb-0">{t("microfrontend.code_repository")}</CardTitle>
                        <CardDescription>{t("microfrontend.code_repository_description")}</CardDescription>
                    </div>
                    <Switch name="codeRepository.enabled" />
                </div>
            </CardHeader>

            {codeRepositoryEnabled && (
                <CardContent className="flex flex-col gap-2 pt-3">
                    <SelectField
                        name="codeRepository.codeRepositoryId"
                        label={t("microfrontend.sourceCodeProvider")}
                        options={repositoriesData?.map(repo => {
                            return {
                                value: repo._id,
                                label: `${repo.name}`,
                                icon: logoMap[repo.provider as keyof typeof logoMap]
                            }
                        })}
                        required
                    />

                    {selectedCodeRepositoryId && !forceCreation && (
                        <>
                            {fetchRepositoriesMutation.isPending ? (
                                <Alert>
                                    <AlertDescription>{t("common.loading")}...</AlertDescription>
                                </Alert>
                            ) : (
                                <SelectField
                                    name="codeRepository.name" // codeRepository.name - Really good for github, do not know if it is good for other providers
                                    label={t("microfrontend.select_repository")}
                                    options={[
                                        !isEdit && {
                                            value: "create_new",
                                            label: t("microfrontend.create_new_repository")
                                        },
                                        ...fetchedRepositories.map(repo => ({
                                            value: repo.name + "",
                                            label: repo.name
                                        }))
                                    ].filter(Boolean)}
                                    placeholder={t("microfrontend.select_repository_placeholder")}
                                />
                            )}
                        </>
                    )}

                    {selectedCodeRepositoryId && repositoriesData?.find?.(repo => repo._id === selectedCodeRepositoryId)?.provider === "GITLAB" && gitlabGroupsQuery.data?.length > 1 && (
                        <SelectField
                            name="codeRepository.gitlab.groupPath"
                            label={t("microfrontend.gitlab_group")}
                            options={gitlabGroupsQuery.data?.map(group => ({
                                value: group.full_path,
                                label: group.full_name
                            }))}
                            onValueChange={selectedGroup => {
                                const groupId = gitlabGroupsQuery.data?.find(group => group.full_path === selectedGroup)?.id
                                setValue("codeRepository.gitlab.groupId", groupId)
                                checkAvailability(selectedRepositoryName, selectedGroup, groupId)
                            }}
                        />
                    )}

                    {(selectedRepositoryId === "create_new" || forceCreation) && (
                        <>
                            <div className="flex flex-col gap-2">
                                <TextField
                                    name="codeRepository.createData.name"
                                    textTransform={value => value.toLowerCase().replace(/[^a-z0-9]/g, "-")}
                                    label={t("microfrontend.repository_name")}
                                    placeholder={t("microfrontend.repository_name_placeholder")}
                                    onDebounce={onDebounceRepository}
                                    debounceTime={500}
                                    required
                                />

                                {repositoryNameAvailability.checking && (
                                    <Alert>
                                        <AlertDescription>{t("microfrontend.repository_name_checking")}</AlertDescription>
                                    </Alert>
                                )}

                                {repositoryNameAvailability.available === false && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{t("microfrontend.repository_name_taken")}</AlertDescription>
                                    </Alert>
                                )}

                                {repositoryNameAvailability.available === true && (
                                    <Alert>
                                        <AlertDescription>{t("microfrontend.repository_name_available")}</AlertDescription>
                                    </Alert>
                                )}

                                {repositoryNameAvailability.error && (
                                    <Alert variant="destructive">
                                        <AlertDescription>{repositoryNameAvailability.error}</AlertDescription>
                                    </Alert>
                                )}
                            </div>

                            {selectedCodeRepositoryId && repositoriesData?.find?.(repo => repo._id === selectedCodeRepositoryId)?.provider === "GITHUB" && (
                                <Switch name="codeRepository.createData.private" label={t("microfrontend.github_private")} />
                            )}
                        </>
                    )}
                </CardContent>
            )}
        </Card>
    )
}

export default CodeRepositorySection
