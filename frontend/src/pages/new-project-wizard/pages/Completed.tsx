import { PartyPopper } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import { WizardStepProps } from "./wizardShared"

const Completed: React.FC<WizardStepProps & { onDone?: () => void }> = ({ project, onDone }) => {
    const navigate = useNavigate()

    return (
        <div data-testid="wizard-completed" className="bg-card border border-border rounded-xl shadow-card mt-8 p-10 flex flex-col items-center text-center gap-5">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <PartyPopper className="size-8 text-primary" />
            </div>
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-semibold text-foreground">Progetto pronto!</h2>
                <p className="text-foreground-secondary max-w-md">
                    {project?.name ? (
                        <>
                            <span className="font-medium text-foreground">{project.name}</span> è stato configurato con successo.
                        </>
                    ) : (
                        "Il progetto è stato configurato con successo."
                    )}{" "}
                    Puoi iniziare ad aggiungere microfrontend.
                </p>
            </div>
            <div className="flex items-center gap-3 mt-2">
                {onDone ? (
                    <Button variant="primary" onClick={onDone}>
                        Inizia a usare il progetto
                    </Button>
                ) : (
                    <>
                        <Button variant="ghost" onClick={() => navigate("/microfrontends")}>
                            Vai alla dashboard
                        </Button>
                        <Button variant="primary" onClick={() => navigate("/microfrontend/new")}>
                            Aggiungi microfrontend
                        </Button>
                    </>
                )}
            </div>
        </div>
    )
}

export default Completed
