import { useTranslation } from "react-i18next";
import { useFormContext } from "react-hook-form";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import TextField from "../input/TextField.rhf";
import SelectField from "../input/SelectField.rhf";
import Switch from "../input/Switch.rhf";
import useCodeRepositoriesApi from "../../hooks/apiClients/useCodeRepositoriesApi";

const logoMap: Record<string, string> = {
    'GITHUB': '/img/GitHub.svg',
    'GITLAB': '/img/GitLab.svg',
    'AZURE_DEV_OPS': '/img/AzureDevOps.svg',
    'AWS': '/img/aws.svg',
    'GOOGLE': '/img/GoogleCloud.svg',
    'AZURE': '/img/Azure.svg'
};

interface CodeRepositorySectionProps {
    repositoriesData: any[];
    isEdit?: boolean;
    forceCreation?: boolean
}

interface RepositoryNameAvailability {
    checking: boolean;
    available: boolean | null;
    error: string | null;
}

const CodeRepositorySection: React.FC<CodeRepositorySectionProps> = ({
    repositoriesData,
    isEdit = false,
    forceCreation = false
}) => {
    const { t } = useTranslation();
    const { watch, setValue } = useFormContext();
    const codeRepositoriesApi = useCodeRepositoriesApi();

    // Watch form values
    const codeRepositoryEnabled = watch("codeRepository.enabled");
    const selectedCodeRepositoryId = watch("codeRepository.codeRepositoryId");
    const selectedRepositoryId = watch("codeRepository.repositoryId");

    // Local state
    const [repositoryNameAvailability, setRepositoryNameAvailability] = useState<RepositoryNameAvailability>({
        checking: false,
        available: null,
        error: null
    });
    const [fetchedRepositories, setFetchedRepositories] = useState<any[]>([]);

    // GitLab groups query
    const gitlabGroupsQuery = useQuery({
        queryKey: ["gitlabGroups", selectedCodeRepositoryId],
        queryFn: () => codeRepositoriesApi.getGitlabGroups(selectedCodeRepositoryId!),
        enabled: !!selectedCodeRepositoryId && repositoriesData?.find(repo => repo._id === selectedCodeRepositoryId)?.provider === "GITLAB"
    });

    // Fetch repositories mutation
    const fetchRepositoriesMutation = useMutation({
        mutationFn: async (codeRepositoryId: string) => {
            const response = await codeRepositoriesApi.getRepositories(codeRepositoryId);
            return response;
        },
        onSuccess: (data) => {
            setFetchedRepositories(data || []);
        }
    });

    // Function to fetch repositories when code repository is selected
    const fetchRepository = async () => {
        if (forceCreation) {
            setValue("codeRepository.repositoryId", "create_new");
            return;
        }

        if (selectedCodeRepositoryId && codeRepositoryEnabled) {
            const data = await fetchRepositoriesMutation.mutateAsync(selectedCodeRepositoryId);
            const repository = data.find((repo: any) => repo.name === selectedRepositoryId);
            if (!repository) {
                setValue("codeRepository.repositoryId", "");
            }
        } else {
            setFetchedRepositories([]);
        }
    };

    // Effect to fetch repositories when a repository is selected
    useEffect(() => {
        fetchRepository();
    }, [selectedCodeRepositoryId, codeRepositoryEnabled, forceCreation]);

    // Repository name availability check
    const onDebounceRepository = async (repositoryName: string) => {
        if(!selectedCodeRepositoryId) return
        if (!repositoryName || !selectedRepositoryId || repositoryName.length < 3) {
            setRepositoryNameAvailability({ checking: false, available: null, error: null });
            return;
        }
        setRepositoryNameAvailability({ checking: true, available: null, error: null });

        try {
            const result = await codeRepositoriesApi.checkRepositoryNameAvailability(
                selectedCodeRepositoryId,
                repositoryName
            );
            setRepositoryNameAvailability({
                checking: false,
                available: result,
                error: null
            });
        } catch (error) {
            setRepositoryNameAvailability({
                checking: false,
                available: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            });
        }
    };

    // Don't render if no repositories available
    if (!repositoriesData || repositoriesData.length === 0) {
        return null;
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
                                label: `${repo.name} (${repo.provider})`,
                                icon: logoMap[repo.provider]
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
                                    name="codeRepository.repositoryId"
                                    label={t("microfrontend.select_repository")}
                                    options={[
                                        !isEdit && {
                                            value: "create_new",
                                            label: t("microfrontend.create_new_repository")
                                        },
                                        ...fetchedRepositories.map(repo => ({
                                            value: repo.name,
                                            label: repo.name
                                        }))
                                    ].filter(Boolean)}
                                    placeholder={t("microfrontend.select_repository_placeholder")}
                                />
                            )}
                        </>
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
                                        <AlertDescription>Checking repository name availability...</AlertDescription>
                                    </Alert>
                                )}

                                {repositoryNameAvailability.available === false && (
                                    <Alert variant="destructive">
                                        <AlertDescription>Repository name is already taken. Please choose a different name.</AlertDescription>
                                    </Alert>
                                )}

                                {repositoryNameAvailability.available === true && (
                                    <Alert>
                                        <AlertDescription>Repository name is available.</AlertDescription>
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

                    {selectedCodeRepositoryId && repositoriesData?.find?.(repo => repo._id === selectedCodeRepositoryId)?.provider === "GITLAB" && (
                        <SelectField
                            name="codeRepository.gitlab.groupId"
                            label={t("microfrontend.gitlab_group")}
                            addClearButton
                            options={gitlabGroupsQuery.data?.map(group => ({
                                value: group.id.toString(),
                                label: group.name || group.full_name
                            }))}
                        />
                    )}
                </CardContent>
            )}
        </Card>
    )
};

export default CodeRepositorySection;