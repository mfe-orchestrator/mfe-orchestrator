import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import Spinner from "@/components/Spinner"
import useProjectWizardClient, { WizardStateDTO } from "@/hooks/apiClients/useProjectWizardClient"
import useProjectStore from "@/store/useProjectStore"
import { getWizardStepPath, WizardStep, WizardStepDTO } from "@/types/ProjectWizardDTO"
import { setProjectIdInLocalStorage } from "@/utils/localStorageUtils"
import CodeRepositories from "./pages/CodeRepositories"
import Completed from "./pages/Completed"
import Environments from "./pages/Environments"
import Hosting from "./pages/Hosting"
import MainData from "./pages/MainData"
import TeamMates from "./pages/TeamMates"
import WizardLayout from "./WizardLayout"

export const wizardStateQueryKey = (projectId: string) => ["project-wizard", projectId]

/**
 * Shell of the backend orchestrated wizard, mounted on
 * `/project-wizard/:projectId/:step`.
 *
 * The step in the url is only a view: the state machine lives on the server, so
 * every command (next/prev/skip) is a server call and the url is realigned with
 * whatever the server answers. Typing the url of a step that has not been
 * reached yet bounces the user back to the current one.
 */
const NewProjectWizard: React.FC = () => {
    const { projectId = "", step: stepSlug = "" } = useParams<{ projectId: string; step: string }>()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const wizardClient = useProjectWizardClient()
    const projectStore = useProjectStore()
    const requestedSlugRef = useRef<string>()

    const wizardQuery = useQuery({
        queryKey: wizardStateQueryKey(projectId),
        queryFn: () => wizardClient.getState(projectId),
        enabled: Boolean(projectId),
        retry: false
    })

    const state = wizardQuery.data

    // The reused feature components (environments, storage, repositories,
    // invitations) scope their calls with the active project, so the project
    // being configured has to be the active one for the whole wizard.
    useEffect(() => {
        if (state?.project && projectStore.project?._id !== state.project._id) {
            projectStore.setProject(state.project)
        }
    }, [state?.project, projectStore.project?._id, projectStore.setProject])

    const applyState = (updated: WizardStateDTO) => {
        queryClient.setQueryData(wizardStateQueryKey(projectId), updated)
        // The projects list carries the wizard status used to lock the console
        queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
        requestedSlugRef.current = updated.currentStepSlug
        navigate(getWizardStepPath(projectId, updated.currentStepSlug), { replace: true })
    }

    const moveMutation = useMutation({
        mutationFn: (action: "next" | "prev" | "skip") => wizardClient[action](projectId),
        onSuccess: applyState
    })

    const goToMutation = useMutation({
        mutationFn: (slug: string) => wizardClient.goTo(projectId, slug),
        onSuccess: applyState,
        onError: () => {
            if (state) {
                navigate(getWizardStepPath(projectId, state.currentStepSlug), { replace: true })
            }
        }
    })

    const mainDataMutation = useMutation({
        mutationFn: (data: { name: string; description?: string }) => wizardClient.saveMainData(projectId, data),
        onSuccess: applyState
    })

    const abortMutation = useMutation({
        mutationFn: () => wizardClient.abort(projectId),
        onSuccess: () => {
            queryClient.removeQueries({ queryKey: wizardStateQueryKey(projectId) })
            queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
            navigate("/", { replace: true })
        }
    })

    // Keeps the url aligned with the server state: a step that has already been
    // completed is re-opened server side, anything else is a redirect.
    useEffect(() => {
        if (!state || goToMutation.isPending || moveMutation.isPending) {
            return
        }
        if (stepSlug === state.currentStepSlug) {
            requestedSlugRef.current = stepSlug
            return
        }

        const requestedStep = state.steps.find(step => step.slug === stepSlug)
        if (requestedStep?.reachable) {
            if (requestedSlugRef.current !== stepSlug) {
                requestedSlugRef.current = stepSlug
                goToMutation.mutate(stepSlug)
            }
            return
        }

        navigate(getWizardStepPath(projectId, state.currentStepSlug), { replace: true })
    }, [state, stepSlug, projectId, navigate, goToMutation, moveMutation.isPending])

    const leaveWizard = (path: string) => {
        setProjectIdInLocalStorage(projectId)
        queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
        navigate(path, { replace: true })
    }

    const busy = moveMutation.isPending || goToMutation.isPending || mainDataMutation.isPending

    if (wizardQuery.isError) {
        return (
            <WizardLayout onClose={() => navigate("/", { replace: true })}>
                <div className="bg-card border border-border rounded-xl shadow-card mt-8 p-10 text-center flex flex-col gap-2">
                    <h2 className="text-xl font-semibold text-foreground">Configurazione non disponibile</h2>
                    <p className="text-foreground-secondary">Non è stato possibile recuperare lo stato della configurazione di questo progetto.</p>
                </div>
            </WizardLayout>
        )
    }

    const projectIsActive = projectStore.project?._id === projectId
    if (!state || !projectIsActive || stepSlug !== state.currentStepSlug) {
        return (
            <WizardLayout steps={state?.steps}>
                <div className="mt-16 flex justify-center">
                    <Spinner />
                </div>
            </WizardLayout>
        )
    }

    const onNext = () => moveMutation.mutate("next")
    const onBack = state.canGoPrev ? () => moveMutation.mutate("prev") : undefined
    const onSkip = state.canSkip ? () => moveMutation.mutate("skip") : undefined

    const renderStep = () => {
        switch (state.currentStep) {
            case WizardStep.MAIN_DATA:
                return <MainData project={state.project} loading={busy} onSubmitMainData={async data => void (await mainDataMutation.mutateAsync(data))} />
            case WizardStep.ENVIRONMENTS:
                return <Environments project={state.project} onNext={onNext} onBack={onBack} loading={busy} />
            case WizardStep.STORAGES:
                return <Hosting project={state.project} onNext={onNext} onBack={onBack} onSkip={onSkip} loading={busy} />
            case WizardStep.REPOSITORIES:
                return <CodeRepositories project={state.project} onNext={onNext} onBack={onBack} onSkip={onSkip} loading={busy} />
            case WizardStep.TEAM_MATES:
                return <TeamMates project={state.project} onNext={onNext} onBack={onBack} onSkip={onSkip} loading={busy} />
            case WizardStep.COMPLETED:
                return <Completed project={state.project} onDone={() => leaveWizard("/microfrontends")} onAddMicrofrontend={() => leaveWizard("/microfrontend/new")} />
            default:
                return null
        }
    }

    const onStepClick = (step: WizardStepDTO) => navigate(getWizardStepPath(projectId, step.slug))

    return (
        <WizardLayout steps={state.steps} onStepClick={busy ? undefined : onStepClick} onAbort={state.currentStep === WizardStep.COMPLETED ? undefined : () => abortMutation.mutateAsync()}>
            {renderStep()}
        </WizardLayout>
    )
}

export default NewProjectWizard
