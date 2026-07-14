import { useQuery } from "@tanstack/react-query"
import { lazy, useEffect, useState } from "react"
import { Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import RouteWithSuspense from "@/components/RouteWithSuspense"
import useProjectWizardClient from "@/hooks/apiClients/useProjectWizardClient"

const MainData = lazy(() => import("./pages/MainData"))
const TeamMates = lazy(() => import("./pages/TeamMates"))
const CodeRepositories = lazy(() => import("./pages/CodeRepositories"))
const Environments = lazy(() => import("./pages/Environments"))
const Hosting = lazy(() => import("./pages/Hosting"))
const Completed = lazy(() => import("./pages/Completed"))

export interface NewProjectWizardProps {
    mountPoint: string
}

const NewProjectWizard = ({ mountPoint }: NewProjectWizardProps) => {
    const { projectId } = useParams<{ projectId?: string }>()
    const projectWizardClient = useProjectWizardClient()
    const location = useLocation()
    const navigate = useNavigate()
    const [step, setStep] = useState<string>()

    useQuery({
        queryKey: ["new-project-wizard", projectId],
        queryFn: async () => {
            if (!projectId) {
                return setStep("main-data") // first state
            }
            const state = await projectWizardClient.getState(projectId)
            setStep(state as any)
        }
    })

    const onNext = async () => {
        projectWizardClient.next(projectId)
    }

    const onPrev = async () => {
        projectWizardClient.prev(projectId)
    }

    useEffect(() => {
        if (!projectId) {
            return
        }
        const target = mountPoint + "/" + projectId + "/" + step
        if (target === location.pathname) {
            return
        }
        navigate(target)
    }, [step, location, projectId])

    if (!projectId) {
        return <RouteWithSuspense element={<MainData onNext={onNext} onPrev={onPrev} />} />
    }

    return (
        <Routes>
            <Route path="/main-data" element={<RouteWithSuspense element={<MainData onNext={onNext} onPrev={onPrev} />} />} />
            <Route path="/team-mates" element={<RouteWithSuspense element={<TeamMates onNext={onNext} onPrev={onPrev} />} />} />
            <Route path="/code-repositories" element={<RouteWithSuspense element={<CodeRepositories onNext={onNext} onPrev={onPrev} />} />} />
            <Route path="/environments" element={<RouteWithSuspense element={<Environments onNext={onNext} onPrev={onPrev} />} />} />
            <Route path="/hosting" element={<RouteWithSuspense element={<Hosting onNext={onNext} onPrev={onPrev} />} />} />
            <Route path="/completed" element={<RouteWithSuspense element={<Completed onNext={onNext} onPrev={onPrev} />} />} />
        </Routes>
    )
}

export default NewProjectWizard
