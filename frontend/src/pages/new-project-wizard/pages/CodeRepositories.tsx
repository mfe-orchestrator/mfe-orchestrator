import { GitBranch } from "lucide-react"
import { useState } from "react"
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
    const [dialogOpen, setDialogOpen] = useState(false)

    return (
        <StepShell
            title="Collega il codice sorgente"
            description="Collega un provider Git (GitHub, GitLab o Azure DevOps) per abilitare build e deploy automatici dei microfrontend."
            skippableNote="Nessuna fretta: puoi collegare o cambiare i repository in qualsiasi momento dalla sezione Repository del progetto."
            footer={<WizardFooter onBack={onBack} onSkip={onSkip} onNext={onNext} nextLabel="Continua" />}
        >
            <div className="flex flex-col items-start gap-3">
                <Button type="button" variant="secondary" onClick={() => setDialogOpen(true)}>
                    <GitBranch className="size-4" /> Collega un repository
                </Button>
            </div>
            <AddRepositoryDialog isOpen={dialogOpen} onOpenChange={setDialogOpen} />
        </StepShell>
    )
}

export default CodeRepositories
