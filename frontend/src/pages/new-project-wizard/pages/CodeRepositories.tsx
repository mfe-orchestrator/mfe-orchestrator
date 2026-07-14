import { Info } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/input/input"
import { Label } from "@/components/ui/label"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { cn } from "@/utils/styleUtils"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

type Provider = "GITHUB" | "GITLAB" | "AZURE_DEV_OPS"

const PROVIDERS: { key: Provider; label: string; icon: string }[] = [
    { key: "GITHUB", label: "GitHub", icon: "/img/GitHub.svg" },
    { key: "GITLAB", label: "GitLab", icon: "/img/GitLab.svg" },
    { key: "AZURE_DEV_OPS", label: "Azure DevOps", icon: "/img/AzureDevOps.svg" }
]

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }> = ({ label, value, onChange, placeholder, type }) => (
    <div className="flex flex-col gap-1">
        <Label>{label}</Label>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
)

const CodeRepositories: React.FC<WizardStepProps> = ({ onNext, onBack, onSkip }) => {
    const repoApi = useCodeRepositoriesApi()
    const notifications = useToastNotificationStore()
    const [provider, setProvider] = useState<Provider>("GITLAB")
    const [loading, setLoading] = useState(false)
    const [f, setF] = useState<Record<string, string>>({ url: "https://gitlab.com" })
    const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }))

    const onSubmit = async () => {
        if (provider !== "GITLAB") {
            // GitHub (OAuth) / Azure (project pick) are connected from the project area
            onNext()
            return
        }
        if (!f.name?.trim() || !f.pat?.trim()) {
            notifications.showWarningNotification({ message: "Inserisci nome e Personal Access Token" })
            return
        }
        setLoading(true)
        try {
            await repoApi.addRepositoryGitlab({ name: f.name, pat: f.pat, url: f.url || "https://gitlab.com", groupPath: f.groupPath })
            notifications.showSuccessNotification({ message: "Repository GitLab collegato" })
            onNext()
        } catch {
            notifications.showErrorNotification({ message: "Connessione a GitLab non riuscita" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <StepShell
            title="Collega il codice sorgente"
            description="Collega un provider Git per abilitare build e deploy automatici dei microfrontend. Puoi saltare e collegarlo più tardi."
            skippableNote="Nessuna fretta: puoi collegare o cambiare i repository in qualsiasi momento dalla sezione Repository del progetto."
            footer={<WizardFooter onBack={onBack} onSkip={onSkip} onNext={onSubmit} loading={loading} nextLabel={provider === "GITLAB" ? "Collega e continua" : "Continua"} />}
        >
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-3 gap-3">
                    {PROVIDERS.map(p => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => setProvider(p.key)}
                            className={cn(
                                "rounded-lg border-2 p-4 flex flex-col items-center gap-2 transition-colors",
                                provider === p.key ? "border-primary bg-accent" : "border-border hover:border-primary/40"
                            )}
                        >
                            <img src={p.icon} alt={p.label} className="h-8 w-8 object-contain" />
                            <span className="text-sm font-medium text-foreground">{p.label}</span>
                        </button>
                    ))}
                </div>

                {provider === "GITLAB" ? (
                    <div className="grid grid-cols-1 gap-4">
                        <Field label="Nome connessione" value={f.name || ""} onChange={set("name")} placeholder="Es. GitLab aziendale" />
                        <Field label="URL istanza" value={f.url || ""} onChange={set("url")} placeholder="https://gitlab.com" />
                        <Field label="Personal Access Token" value={f.pat || ""} onChange={set("pat")} type="password" />
                        <Field label="Group path (opzionale)" value={f.groupPath || ""} onChange={set("groupPath")} placeholder="mio-gruppo" />
                    </div>
                ) : (
                    <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/60 p-4 text-sm text-foreground-secondary">
                        <Info className="size-5 text-primary shrink-0 mt-0.5" />
                        <span>
                            {provider === "GITHUB"
                                ? "GitHub si collega tramite autorizzazione OAuth dalla sezione Repository del progetto, una volta completata la configurazione."
                                : "Azure DevOps richiede la selezione del progetto DevOps: potrai collegarlo dalla sezione Repository del progetto."}
                        </span>
                    </div>
                )}
            </div>
        </StepShell>
    )
}

export default CodeRepositories
