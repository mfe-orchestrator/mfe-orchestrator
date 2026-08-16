import { IconTile } from "@mfe-orchestrator/design-system"
import { PartyPopper } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { WizardStepProps } from "./wizardShared"

const Completed: React.FC<WizardStepProps & { onDone?: () => void }> = ({ project, onDone }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()

    return (
        <div data-testid="wizard-completed" className="bg-card border border-border rounded-xl shadow-card mt-8 p-10 flex flex-col items-center text-center gap-5">
            <IconTile size="lg" icon={<PartyPopper />} />
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold text-foreground">{t("newProjectWizard.completed.title")}</h2>
                <p className="text-foreground-secondary max-w-md">
                    {project?.name ? (
                        <>
                            <span className="font-medium text-foreground">{project.name}</span> {t("newProjectWizard.completed.configured_with_name")}
                        </>
                    ) : (
                        t("newProjectWizard.completed.configured_generic")
                    )}{" "}
                    {t("newProjectWizard.completed.start_adding")}
                </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
                {onDone ? (
                    <Button variant="primary" onClick={onDone}>
                        {t("newProjectWizard.completed.start_deploying")}
                    </Button>
                ) : (
                    <>
                        <Button variant="ghost" onClick={() => navigate("/microfrontends")}>
                            {t("newProjectWizard.completed.go_to_dashboard")}
                        </Button>
                        <Button variant="primary" onClick={() => navigate("/microfrontend/new")}>
                            {t("newProjectWizard.completed.add_microfrontend")}
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}

export default Completed
