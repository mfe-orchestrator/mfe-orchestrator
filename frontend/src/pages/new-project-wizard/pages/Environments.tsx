import { Button } from "@/components/atoms"
import NoEnvironmentPlaceholder from "@/pages/environments/partials/NoEnvironmentPlaceholder"
import { WizardStepProps } from "./wizardShared"

/**
 * Environments step — reuses NoEnvironmentPlaceholder (presets + editable list +
 * bulk create) from the Environments feature, so it stays consistent with the
 * standalone environment setup.
 */
const Environments: React.FC<WizardStepProps> = ({ onNext, onBack }) => (
    <div className="mt-8 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
                <h2 data-testid="wizard-step-title" className="text-2xl font-semibold text-foreground">
                    Configura gli ambienti
                </h2>
                <p className="text-foreground-secondary">
                    Gli ambienti (es. sviluppo, produzione) ti permettono di gestire versioni diverse dei microfrontend. Scegli un preset o personalizzali, poi salva.
                </p>
            </div>
            {onBack && (
                <Button dataTestId="wizard-back" variant="ghost" onClick={onBack}>
                    Indietro
                </Button>
            )}
        </div>

        <NoEnvironmentPlaceholder onSaveSuccess={() => onNext()} />
    </div>
)

export default Environments
