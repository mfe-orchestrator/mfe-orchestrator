import { Info } from "lucide-react"
import { Button } from "@/components/atoms"
import { StorageForm } from "@/pages/storages/AddStorage"
import { WizardStepProps } from "./wizardShared"

/**
 * Storage step — reuses the real StorageForm from the Storages feature so the
 * payload/validation stay identical to the standalone "New storage" page.
 */
const Hosting: React.FC<WizardStepProps> = ({ onNext, onBack, onSkip }) => (
    <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
                <h2 data-testid="wizard-step-title" className="text-2xl font-semibold text-foreground">
                    Dove ospitiamo i microfrontend?
                </h2>
                <p className="text-foreground-secondary">Collega un bucket di storage per il deploy dei bundle. Puoi saltare questo passaggio e configurarlo più tardi.</p>
            </div>
        </div>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0 text-primary" />
            Nessuna fretta: puoi aggiungere o modificare gli storage in qualsiasi momento dalle impostazioni del progetto.
        </p>

        <StorageForm onSubmitSuccess={() => onNext()} onCancel={() => onSkip?.()} onBack={onBack} submitLabel="Salva e continua" cancelLabel="Salta" notifyOnSuccess={false} />
    </div>
)

export default Hosting
