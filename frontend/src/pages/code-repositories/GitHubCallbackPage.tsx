import { useMutation } from "@tanstack/react-query"
import { AlertCircle, CheckCircle } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import Spinner from "@/components/Spinner"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent } from "@/components/ui/card"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"

const GitHubCallbackPage = () => {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [status, setStatus] = useState<"loading" | "success" | "error">("loading")
    const [errorMessage, setErrorMessage] = useState("")
    const repositoryApi = useCodeRepositoriesApi()

    const saveRepositoryMutation = useMutation({
        mutationFn: repositoryApi.addRepositoryGithub
    })

    const handleCallback = useCallback(async () => {
        const code = searchParams.get("code")
        const state = searchParams.get("state")
        const error = searchParams.get("error")
        const codeRepositoryId = searchParams.get("codeRepositoryId")

        if (error) {
            setStatus("error")
            setErrorMessage(`GitHub authentication failed: ${error}`)
            return
        }

        if (!code || !state) {
            setStatus("error")
            setErrorMessage("Missing authentication parameters")
            return
        }

        // Decode and verify state
        const decodedState = JSON.parse(atob(state))
        if (decodedState.provider !== "github") {
            throw new Error("Invalid state parameter")
        }

        const repository = await saveRepositoryMutation.mutateAsync({
            code,
            state,
            codeRepositoryId
        })
        setStatus("success")

        navigate(`/code-repositories/github/${repository._id}?isNew=${!codeRepositoryId}`)
    }, [searchParams, navigate, saveRepositoryMutation])

    useEffect(() => {
        handleCallback()
    }, [handleCallback])

    const handleRetry = () => {
        navigate("/code-repositories")
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <Card className="w-full max-w-md">
                <CardContent className="p-6">
                    <div className="text-center">
                        {saveRepositoryMutation.isPending && (
                            <>
                                <Spinner />
                                <h2 className="mt-4 text-lg font-semibold">Authenticating with GitHub</h2>
                                <p className="mt-2 text-sm text-muted-foreground">Please wait while we complete the authentication process...</p>
                            </>
                        )}

                        {status === "success" && (
                            <>
                                <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                                <h2 className="mt-4 text-lg font-semibold text-green-700">Authentication Successful!</h2>
                                <p className="mt-2 text-sm text-muted-foreground">You have been successfully authenticated with GitHub. Redirecting to repository selection...</p>
                            </>
                        )}

                        {(status === "error" || saveRepositoryMutation.isError) && (
                            <>
                                <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
                                <h2 className="mt-4 text-lg font-semibold text-red-700">Authentication Failed</h2>
                                <p className="mt-2 text-sm text-muted-foreground">{errorMessage || saveRepositoryMutation.error?.message}</p>
                                <div className="mt-4 space-x-2">
                                    <Button onClick={handleRetry} variant="secondary">
                                        Try Again
                                    </Button>
                                    <Button onClick={() => navigate("/code-repositories")}>Back to Repositories</Button>
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
