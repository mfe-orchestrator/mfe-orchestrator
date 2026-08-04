import { useQuery } from "@tanstack/react-query"
import { Layers } from "lucide-react"
import { Button } from "@/components/atoms"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import NoEnvironmentPlaceholder from "@/pages/environments/partials/NoEnvironmentPlaceholder"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

/**
 * Environments step — reuses NoEnvironmentPlaceholder (presets + editable list +
 * bulk create) from the Environments feature, so it stays consistent with the
 * standalone environment setup.
 *
 * The backend refuses to leave this step until the project has at least one
 * environment, so when the user comes back the already created ones are shown
 * instead of the empty state.
 */
const Environments: React.FC<WizardStepProps> = ({ project, onNext, onBack, loading }) => {
    const projectApi = useProjectApi()

    const environmentsQuery = useQuery({
        queryKey: ["wizard-environments", project?._id],
        queryFn: () => projectApi.getEnvironmentsByProjectId(project!._id),
        enabled: Boolean(project?._id)
    })

    const environments = environmentsQuery.data ?? []

    if (environments.length > 0) {
        return (
            <StepShell
                title="Configura gli ambienti"
                description="Questi sono gli ambienti del progetto. Potrai aggiungerne altri o modificarli in qualsiasi momento dalla sezione Ambienti."
                footer={<WizardFooter onBack={onBack} onNext={onNext} loading={loading} nextLabel="Continua" />}
            >
                <div className="flex flex-col gap-2">
                    {environments.map(environment => (
                        <div key={environment._id ?? environment.slug} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                            <Layers className="size-4 text-primary shrink-0" />
                            <span className="text-sm font-medium text-foreground">{environment.name}</span>
                            <span className="text-xs text-muted-foreground">{environment.slug}</span>
                            {environment.isProduction && <span className="ml-auto text-xs font-medium text-primary">Produzione</span>}
                        </div>
                    ))}
                </div>
            </StepShell>
        )
    }

    return (
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
                    <Button dataTestId="wizard-back" variant="ghost" onClick={onBack} disabled={loading}>
                        Indietro
                    </Button>
                )}
            </div>

            <NoEnvironmentPlaceholder
                onSaveSuccess={async () => {
                    await environmentsQuery.refetch()
                    onNext()
                }}
                notifyOnSuccess={false}
            />
        </div>
    )
}

export default Environments
