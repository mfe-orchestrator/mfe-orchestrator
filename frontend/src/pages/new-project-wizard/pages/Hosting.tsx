import { Alert, AlertDescription, AlertTitle } from "@mfe-orchestrator/design-system"
import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"
import { StorageForm } from "@/pages/storages/AddStorage"
import { WizardStepProps } from "./wizardShared"

/**
 * Storage step — reuses the real StorageForm from the Storages feature so the
 * payload/validation stay identical to the standalone "New storage" page.
 */
const Hosting: React.FC<WizardStepProps> = ({ onNext, onBack, onSkip }) => {
    const { t } = useTranslation()

    return (
        <div className="mt-8 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <h2 data-testid="wizard-step-title" className="text-2xl font-semibold text-foreground">
                        {t("newProjectWizard.hosting.title")}
                    </h2>
                    <p className="text-foreground-secondary">{t("newProjectWizard.hosting.description")}</p>
                </div>
            </div>

            <Alert className="border-primary/50 [&>svg]:text-primary">
                <Info className="size-5" />
                <AlertTitle>{t("newProjectWizard.hosting.alert_title")}</AlertTitle>
                <AlertDescription>{t("newProjectWizard.hosting.alert_description")}</AlertDescription>
            </Alert>

            <StorageForm
                onSubmitSuccess={() => onNext()}
                onCancel={() => onSkip?.()}
                onBack={onBack}
                submitLabel={t("newProjectWizard.hosting.submit")}
                cancelLabel={t("newProjectWizard.footer.skip")}
                notifyOnSuccess={false}
            />
        </div>
    )
}

export default Hosting
