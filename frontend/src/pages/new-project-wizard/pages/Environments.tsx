import { Plus, X } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/atoms"
import { Input } from "@/components/ui/input/input"
import useEnvironmentsApi, { CreateEnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { cn } from "@/utils/styleUtils"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

const DEV: CreateEnvironmentDTO = { name: "Development", slug: "dev", color: "#3b82f6" }
const UAT: CreateEnvironmentDTO = { name: "UAT", slug: "uat", color: "#f59e0b" }
const TEST: CreateEnvironmentDTO = { name: "Test", slug: "test", color: "#84cc16" }
const PROD: CreateEnvironmentDTO = { name: "Production", slug: "prod", color: "#22c55e", isProduction: true }

const PRESETS: { key: string; label: string; envs: CreateEnvironmentDTO[] }[] = [
    { key: "base", label: "Base", envs: [DEV, PROD] },
    { key: "standard", label: "Standard", envs: [DEV, UAT, PROD] },
    { key: "full", label: "Completo", envs: [DEV, UAT, TEST, PROD] }
]

const Environments: React.FC<WizardStepProps> = ({ onNext, onBack }) => {
    const environmentsApi = useEnvironmentsApi()
    const notifications = useToastNotificationStore()
    const [preset, setPreset] = useState("standard")
    const [envs, setEnvs] = useState<CreateEnvironmentDTO[]>(PRESETS[1].envs)
    const [custom, setCustom] = useState("")
    const [loading, setLoading] = useState(false)

    const applyPreset = (key: string) => {
        const found = PRESETS.find(p => p.key === key)
        if (found) {
            setPreset(key)
            setEnvs(found.envs)
        }
    }

    const addCustom = () => {
        const name = custom.trim()
        if (!name) return
        const slug = slugify(name)
        if (envs.some(e => e.slug === slug)) {
            notifications.showWarningNotification({ message: "Ambiente già presente" })
            return
        }
        setPreset("")
        setEnvs(prev => [...prev, { name, slug, color: "#8b5cf6" }])
        setCustom("")
    }

    const removeEnv = (slug: string) => {
        setPreset("")
        setEnvs(prev => prev.filter(e => e.slug !== slug))
    }

    const onSubmit = async () => {
        if (envs.length === 0) {
            notifications.showWarningNotification({ message: "Aggiungi almeno un ambiente" })
            return
        }
        setLoading(true)
        try {
            await environmentsApi.createEnvironmentsBulk(envs)
            notifications.showSuccessNotification({ message: `${envs.length} ambienti creati` })
            onNext()
        } catch {
            notifications.showErrorNotification({ message: "Impossibile creare gli ambienti" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <StepShell
            title="Configura gli ambienti"
            description="Gli ambienti (es. sviluppo, produzione) ti permettono di gestire versioni diverse dei microfrontend. Scegli un preset o personalizzali."
            footer={<WizardFooter onBack={onBack} onNext={onSubmit} loading={loading} />}
        >
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-3 gap-3">
                    {PRESETS.map(p => (
                        <button
                            key={p.key}
                            type="button"
                            onClick={() => applyPreset(p.key)}
                            className={cn("rounded-lg border-2 p-4 text-left transition-colors", preset === p.key ? "border-primary bg-accent" : "border-border hover:border-primary/40")}
                        >
                            <div className="font-semibold text-foreground">{p.label}</div>
                            <div className="text-xs text-muted-foreground mt-1">{p.envs.map(e => e.slug.toUpperCase()).join(" · ")}</div>
                        </button>
                    ))}
                </div>

                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-foreground-secondary">Ambienti selezionati</span>
                    <div className="flex flex-wrap gap-2">
                        {envs.length === 0 && <span className="text-sm text-muted-foreground">Nessun ambiente</span>}
                        {envs.map(env => (
                            <span key={env.slug} className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/50 pl-3 pr-1.5 py-1 text-sm">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: env.color }} />
                                {env.name}
                                {env.isProduction && <span className="text-[10px] uppercase text-muted-foreground">prod</span>}
                                <button type="button" onClick={() => removeEnv(env.slug)} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Rimuovi ${env.name}`}>
                                    <X className="size-3.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex items-end gap-2">
                    <Input
                        value={custom}
                        onChange={e => setCustom(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") {
                                e.preventDefault()
                                addCustom()
                            }
                        }}
                        placeholder="Aggiungi ambiente personalizzato…"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={addCustom}>
                        <Plus className="size-4" /> Aggiungi
                    </Button>
                </div>
            </div>
        </StepShell>
    )
}

export default Environments
