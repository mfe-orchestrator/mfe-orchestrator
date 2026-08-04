import { useQuery } from "@tanstack/react-query"
import { Navigate, Route, Routes } from "react-router-dom"
import Spinner from "@/components/Spinner"
import useProjectWizardClient from "@/hooks/apiClients/useProjectWizardClient"
import { getWizardStepPath } from "@/types/ProjectWizardDTO"
import NewProjectWizard from "./NewProjectWizard"
import StartProjectWizard from "./StartProjectWizard"

/**
 * `/project-wizard` — resumes the wizard left running, if any, otherwise starts
 * a new one. The entry point never renders a step by itself: it is the backend
 * that says where the user is.
 */
const ResumeOrStartWizard: React.FC = () => {
    const wizardClient = useProjectWizardClient()

    const pendingQuery = useQuery({
        queryKey: ["project-wizard-pending"],
        queryFn: () => wizardClient.getPending(),
        retry: false,
        gcTime: 0
    })

    if (pendingQuery.isPending) {
        return (
            <div className="w-screen h-screen flex items-center justify-center bg-background">
                <Spinner />
            </div>
        )
    }

    const pending = pendingQuery.data
    if (pending) {
        return <Navigate to={getWizardStepPath(pending.projectId, pending.currentStepSlug)} replace />
    }

    return <Navigate to="/project-wizard/new" replace />
}

/**
 * The wizard owns its own routes, one per step, and lives outside the console
 * layout: while it runs the project it is configuring cannot be used.
 */
const ProjectWizardRoutes: React.FC = () => (
    <Routes>
        <Route index element={<ResumeOrStartWizard />} />
        <Route path="new" element={<StartProjectWizard />} />
        <Route path=":projectId/:step" element={<NewProjectWizard />} />
        {/* No step in the url: let the backend state decide which one to open */}
        <Route path=":projectId" element={<NewProjectWizard />} />
        <Route path="*" element={<Navigate to="/project-wizard" replace />} />
    </Routes>
)

export default ProjectWizardRoutes
