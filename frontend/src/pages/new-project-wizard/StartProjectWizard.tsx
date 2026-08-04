import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import useProjectWizardClient, { WizardMainDataDTO } from "@/hooks/apiClients/useProjectWizardClient"
import useProjectStore from "@/store/useProjectStore"
import { getWizardStepPath, isProjectLockedByWizard, WizardStep } from "@/types/ProjectWizardDTO"
import { wizardStateQueryKey } from "./NewProjectWizard"
import MainData from "./pages/MainData"
import WizardLayout from "./WizardLayout"

/**
 * First step of the wizard, mounted on `/project-wizard/new`: it is the only
 * step without a project yet. Submitting it asks the backend to create the
 * project and to open its wizard, then hands over to the routed steps.
 */
const StartProjectWizard: React.FC = () => {
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const wizardClient = useProjectWizardClient()
    const projectApi = useProjectApi()
    const projectStore = useProjectStore()

    const stepsQuery = useQuery({
        queryKey: ["project-wizard-steps"],
        queryFn: () => wizardClient.getSteps(),
        staleTime: Infinity
    })

    const projectsQuery = useQuery({
        queryKey: ["projects-mine"],
        queryFn: () => projectApi.getMineProjects()
    })

    // Without a usable project there is nothing to go back to: the wizard is
    // the only thing the user can do.
    const hasUsableProject = Boolean(projectsQuery.data?.some(project => !isProjectLockedByWizard(project.wizard)))

    const startMutation = useMutation({
        mutationFn: (data: WizardMainDataDTO) => wizardClient.start(data),
        onSuccess: state => {
            projectStore.setProject(state.project)
            queryClient.setQueryData(wizardStateQueryKey(state.projectId), state)
            queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
            navigate(getWizardStepPath(state.projectId, state.currentStepSlug), { replace: true })
        }
    })

    // Before the project exists the stepper can only show the layout, which the
    // backend owns as well.
    const steps = (stepsQuery.data ?? []).map(step => ({
        ...step,
        completed: false,
        current: step.step === WizardStep.MAIN_DATA,
        reachable: step.step === WizardStep.MAIN_DATA
    }))

    return (
        <WizardLayout steps={steps} onClose={hasUsableProject ? () => navigate("/microfrontends", { replace: true }) : undefined}>
            <MainData loading={startMutation.isPending} onSubmitMainData={async data => void (await startMutation.mutateAsync(data))} />
        </WizardLayout>
    )
}

export default StartProjectWizard
