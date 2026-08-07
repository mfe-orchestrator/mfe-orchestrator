import { useMutation } from "@tanstack/react-query"
import { AlertCircle, CheckCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Button } from "@/components/atoms"
import Spinner from "@/components/Spinner"
import { Card, CardContent } from "@/components/ui/card"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"

const GitHubCallbackPage = () => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [validationError, setValidationError] = useState("")
    const repositoryApi = useCodeRepositoriesApi()

    const saveRepositoryMutation = useMutation({
        mutationFn: repositoryApi.addRepositoryGithub,
        onSuccess: repository => {
            navigate(`/code-repositories/github/${repository._id}?isNew=${!searchParams.get("codeRepositoryId")}`)
        }
    })

    // biome-ignore lint/correctness/useExhaustiveDependencies: il code OAuth è monouso, lo scambio deve partire una sola volta al mount
    useEffect(() => {
        const code = searchParams.get("code")
        const state = searchParams.get("state")
        const error = searchParams.get("error")

        if (error) {
            setValidationError(t("codeRepositories.github.callback.authFailed", { error }))
            return
        }

        if (!code || !state) {
            setValidationError(t("codeRepositories.github.callback.missingParams"))
            return
        }

        const decodedState = JSON.parse(atob(state))
        if (decodedState.provider !== "github") {
            setValidationError(t("codeRepositories.github.callback.invalidState"))
            return
        }

        saveRepositoryMutation.mutate({
            code,
            state,
            codeRepositoryId: searchParams.get("codeRepositoryId")
        })
    }, [])

    return (
        <div className="min-h-screen flex items-center justify-center">
            <Card className="w-full max-w-md">
                <CardContent className="p-6">
                    <div className="text-center">
                        {saveRepositoryMutation.isPending && (
                            <>
                                <Spinner />
                                <h2 className="mt-4 text-lg font-semibold">{t("codeRepositories.github.callback.authenticatingTitle")}</h2>
                                <p className="mt-2 text-sm text-muted-foreground">{t("codeRepositories.github.callback.authenticatingDescription")}</p>
                            </>
                        )}

                        {saveRepositoryMutation.isSuccess && (
                            <>
                                <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                                <h2 className="mt-4 text-lg font-semibold text-green-700">{t("codeRepositories.github.callback.successTitle")}</h2>
                                <p className="mt-2 text-sm text-muted-foreground">{t("codeRepositories.github.callback.successDescription")}</p>
                            </>
                        )}

                        {(validationError || saveRepositoryMutation.isError) && (
                            <>
                                <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
                                <h2 className="mt-4 text-lg font-semibold text-red-700">{t("codeRepositories.github.callback.failedTitle")}</h2>
                                <p className="mt-2 text-sm text-muted-foreground">{validationError || saveRepositoryMutation.error?.message}</p>
                                <div className="mt-4 space-x-2">
                                    <Button onClick={() => navigate("/code-repositories")} variant="secondary">
                                        {t("codeRepositories.github.callback.tryAgain")}
                                    </Button>
                                    <Button onClick={() => navigate("/code-repositories")}>{t("codeRepositories.github.callback.backToRepositories")}</Button>
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export default GitHubCallbackPage
