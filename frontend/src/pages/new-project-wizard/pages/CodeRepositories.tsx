import { GitBranch } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { AddRepositoryDialog } from "@/pages/code-repositories/partials/AddRepositoryDialog"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

/**
 * Repository step — reuses the real AddRepositoryDialog (the same provider
 * picker used in the Code Repositories section). Repository connection is a
 * navigate-away / OAuth flow, so it can't be inlined; we delegate to the
 * existing component instead of duplicating its logic.
 */
const CodeRepositories: React.FC<WizardStepProps> = ({ onNext, onBack, onSkip }) => {
    const { t } = useTranslation()
    const [dialogOpen, setDialogOpen] = useState(false)

    return (
        <StepShell
            title={t("newProjectWizard.code_repositories.title")}
            description={t("newProjectWizard.code_repositories.description")}
            skippableNote={t("newProjectWizard.code_repositories.skippable_note")}
            footer={<WizardFooter onBack={onBack} onSkip={onSkip} onNext={onNext} />}
        >
            <div className="flex flex-col items-start gap-3">
                <Button type="button" variant="secondary" onClick={() => setDialogOpen(true)}>
                    <GitBranch className="size-4" /> {t("newProjectWizard.code_repositories.connect_repository")}
                </Button>
            </div>
            <AddRepositoryDialog isOpen={dialogOpen} onOpenChange={setDialogOpen} />
        </StepShell>
    )
}

export default CodeRepositories
