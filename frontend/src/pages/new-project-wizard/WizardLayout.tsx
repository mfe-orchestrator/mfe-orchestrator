import { X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { WizardStepDTO } from "@/types/ProjectWizardDTO"
import { WizardStepper } from "./pages/wizardShared"

interface WizardLayoutProps extends React.PropsWithChildren {
    /** Steps as returned by the backend; when missing the stepper is not shown */
    steps?: WizardStepDTO[]
    onStepClick?: (step: WizardStepDTO) => void
    /** Closes the wizard without leaving anything behind (no project created yet) */
    onClose?: () => void
    /** Deletes the project being configured: the only way out once it exists */
    onAbort?: () => Promise<void> | void
}

const WizardLayout: React.FC<WizardLayoutProps> = ({ steps, onStepClick, onClose, onAbort, children }) => {
    const { t } = useTranslation()
    const [abortDialogOpen, setAbortDialogOpen] = useState(false)
    const [aborting, setAborting] = useState(false)

    const confirmAbort = async () => {
        setAborting(true)
        try {
            await onAbort?.()
            setAbortDialogOpen(false)
        } finally {
            setAborting(false)
        }
    }

    return (
        <div className="w-screen h-screen overflow-y-auto bg-background">
            <div className="max-w-3xl mx-auto px-4 py-10 md:py-14">
                <header className="flex items-center gap-3 mb-10">
                    <div className="h-9 w-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">MF</div>
                    <div>
                        <h1 className="text-xl font-semibold text-foreground leading-tight">{t("app.name")}</h1>
                        <p className="text-sm text-foreground-secondary">Crea un nuovo progetto</p>
                    </div>
                    {onClose && (
                        <Button dataTestId="wizard-close" variant="ghost" size="icon" className="ml-auto text-muted-foreground hover:text-foreground" aria-label="Chiudi wizard" onClick={onClose}>
                            <X />
                        </Button>
                    )}
                    {!onClose && onAbort && (
                        <Button dataTestId="wizard-abort" variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setAbortDialogOpen(true)}>
                            Annulla configurazione
                        </Button>
                    )}
                </header>

                {steps && <WizardStepper steps={steps} onStepClick={onStepClick} />}

                {children}
            </div>

            <Dialog open={abortDialogOpen} onOpenChange={setAbortDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Annullare la configurazione?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-foreground-secondary">
                        Il progetto non è ancora utilizzabile: annullando la configurazione verrà eliminato insieme a tutto quello che hai impostato finora.
                    </p>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setAbortDialogOpen(false)} disabled={aborting}>
                            {t("common.cancel")}
                        </Button>
                        <Button dataTestId="wizard-abort-confirm" variant="destructive" onClick={confirmAbort} disabled={aborting}>
                            {aborting ? "Attendere…" : "Elimina progetto"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

export default WizardLayout
