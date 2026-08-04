import { useQuery } from "@tanstack/react-query"
import { Database, GitBranch, Layers, PartyPopper, Users } from "lucide-react"
import { Button } from "@/components/atoms"
import { Project } from "@/hooks/apiClients/useProjectApi"
import useProjectWizardClient from "@/hooks/apiClients/useProjectWizardClient"

interface CompletedProps {
    project?: Project
    /** Leaves the wizard: the project is unlocked and can finally be used */
    onDone: () => void
    onAddMicrofrontend: () => void
}

const RecapTile: React.FC<{ icon: React.ReactNode; label: string; value: number }> = ({ icon, label, value }) => (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-4">
        <span className="text-primary">{icon}</span>
        <span className="text-lg font-semibold text-foreground">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
    </div>
)

const Completed: React.FC<CompletedProps> = ({ project, onDone, onAddMicrofrontend }) => {
    const wizardClient = useProjectWizardClient()

    const recapQuery = useQuery({
        queryKey: ["project-wizard-recap", project?._id],
        queryFn: () => wizardClient.getRecap(project!._id),
        enabled: Boolean(project?._id)
    })

    const recap = recapQuery.data

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

            {recap && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full mt-2">
                    <RecapTile icon={<Layers className="size-4" />} label="Ambienti" value={recap.environments} />
                    <RecapTile icon={<Database className="size-4" />} label="Storage" value={recap.storages} />
                    <RecapTile icon={<GitBranch className="size-4" />} label="Repository" value={recap.codeRepositories} />
                    <RecapTile icon={<Users className="size-4" />} label="Membri" value={recap.users} />
                </div>
            )}

            <div className="flex items-center gap-3 mt-2">
                <Button dataTestId="wizard-go-to-dashboard" variant="ghost" onClick={onDone}>
                    Vai alla dashboard
                </Button>
                <Button variant="primary" onClick={onAddMicrofrontend}>
                    Aggiungi microfrontend
                </Button>
            </div>
        </div>
    )
}

export default Completed
