import { Database, FolderPlus, GitBranch, Layers, Users, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import PageHead from "@/components/PageHead"
import { Project } from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import CodeRepositories from "./pages/CodeRepositories"
import Completed from "./pages/Completed"
import Environments from "./pages/Environments"
import Hosting from "./pages/Hosting"
import MainData from "./pages/MainData"
import TeamMates from "./pages/TeamMates"
import { WizardStepMeta, WizardStepper } from "./pages/wizardShared"

export interface NewProjectWizardProps {
    mountPoint: string
    /** When provided the wizard runs embedded (e.g. first-run): no close button, and completion is handled via this callback instead of router navigation. */
    onComplete?: () => void
}

const NewProjectWizard: React.FC<NewProjectWizardProps> = ({ onComplete }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()

    const STEPS: WizardStepMeta[] = [
        { key: "name", label: t("newProjectWizard.steps.name"), icon: <FolderPlus className="size-5" /> },
        { key: "environments", label: t("newProjectWizard.steps.environments"), icon: <Layers className="size-5" /> },
        { key: "storages", label: t("newProjectWizard.steps.storages"), icon: <Database className="size-5" /> },
        { key: "repositories", label: t("newProjectWizard.steps.repositories"), icon: <GitBranch className="size-5" /> },
        { key: "collaborators", label: t("newProjectWizard.steps.collaborators"), icon: <Users className="size-5" /> }
    ]
    const embedded = Boolean(onComplete)
    const projectStore = useProjectStore()
    const [stepIndex, setStepIndex] = useState(0)
    const [completed, setCompleted] = useState(false)
    const [project, setProject] = useState<Project>()

    const goNext = () => setStepIndex(i => Math.min(i + 1, STEPS.length - 1))
    const goBack = () => setStepIndex(i => Math.max(i - 1, 0))

    const onCreated = (created: Project) => {
        setProject(created)
        projectStore.setProject(created)
        goNext()
    }

    const finish = () => setCompleted(true)

    const renderStep = () => {
        switch (stepIndex) {
            case 0:
                return <MainData project={project} onCreated={onCreated} onNext={goNext} isFirst />
            case 1:
                return <Environments project={project} onNext={goNext} onBack={goBack} />
            case 2:
                return <Hosting project={project} onNext={goNext} onBack={goBack} onSkip={goNext} />
            case 3:
                return <CodeRepositories project={project} onNext={goNext} onBack={goBack} onSkip={goNext} />
            case 4:
                return <TeamMates project={project} onNext={finish} onBack={goBack} onSkip={finish} />
            default:
                return null
        }
    }

    return (
        <div className="w-screen h-screen overflow-y-auto bg-background">
            <PageHead title={t("newProjectWizard.subtitle")} />
            <div className="max-w-3xl mx-auto px-4 py-10 md:py-14">
                <header className="flex items-center gap-3 mb-10">
                    <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">MF</div>
                    <div>
                        <h1 className="text-xl font-semibold text-foreground leading-tight">{t("app.name")}</h1>
                        <p className="text-sm text-foreground-secondary">{t("newProjectWizard.subtitle")}</p>
                    </div>
                    {!embedded && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="ml-auto text-muted-foreground hover:text-foreground"
                            aria-label={t("newProjectWizard.close")}
                            dataTestId="wizard-close"
                            onClick={() => navigate("/microfrontends")}
                        >
                            <X />
                        </Button>
                    )}
                </header>

                {completed ? (
                    <Completed project={project} onNext={() => undefined} onDone={onComplete} />
                ) : (
                    <>
                        <WizardStepper steps={STEPS} current={stepIndex} />
                        {renderStep()}
                    </>
                )}
            </div>
        </div>
    )
}

export default NewProjectWizard
