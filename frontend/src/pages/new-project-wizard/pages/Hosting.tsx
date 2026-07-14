import { useState } from "react"
import { Input } from "@/components/ui/input/input"
import { Label } from "@/components/ui/label"
import useStorageApi, { CreateStorageDTO, StorageType } from "@/hooks/apiClients/useStorageApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { cn } from "@/utils/styleUtils"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

const PROVIDERS: { type: StorageType; label: string; icon: string }[] = [
    { type: StorageType.AWS, label: "Amazon S3", icon: "/img/aws.svg" },
    { type: StorageType.AZURE, label: "Azure Blob", icon: "/img/Azure.svg" },
    { type: StorageType.GOOGLE, label: "Google Cloud", icon: "/img/GoogleCloud.svg" }
]

const Field: React.FC<{ label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }> = ({ label, value, onChange, placeholder, type }) => (
    <div className="flex flex-col gap-1">
        <Label>{label}</Label>
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} />
    </div>
)

const Hosting: React.FC<WizardStepProps> = ({ onNext, onBack, onSkip }) => {
    const storageApi = useStorageApi()
    const notifications = useToastNotificationStore()
    const [loading, setLoading] = useState(false)
    const [type, setType] = useState<StorageType>(StorageType.AWS)
    const [name, setName] = useState("")
    const [f, setF] = useState<Record<string, string>>({})
    const set = (k: string) => (v: string) => setF(prev => ({ ...prev, [k]: v }))

    const buildDto = (): CreateStorageDTO | null => {
        if (!name.trim()) {
            notifications.showWarningNotification({ message: "Dai un nome allo storage" })
            return null
        }
        switch (type) {
            case StorageType.AWS:
                return { name, type, authConfig: { region: f.region || "", accessKeyId: f.accessKeyId || "", secretAccessKey: f.secretAccessKey || "", bucketName: f.bucketName || "" } }
            case StorageType.AZURE:
                return { name, type, authConfig: { authType: "connectionString", connectionString: f.connectionString || "", containerName: f.containerName || "" } }
            case StorageType.GOOGLE:
                return { name, type, authConfig: { authType: "serviceAccount", jsonKey: f.jsonKey || "", bucketName: f.bucketName || "" } }
        }
    }

    const onSubmit = async () => {
        const dto = buildDto()
        if (!dto) return
        setLoading(true)
        try {
            await storageApi.create(dto)
            notifications.showSuccessNotification({ message: `Storage "${name}" configurato` })
            onNext()
        } catch {
            notifications.showErrorNotification({ message: "Impossibile configurare lo storage" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <StepShell
            title="Dove ospitiamo i microfrontend?"
            description="Collega un bucket di storage per il deploy dei bundle. Puoi saltare questo passaggio e configurarlo più tardi."
            skippableNote="Nessuna fretta: puoi aggiungere o modificare gli storage in qualsiasi momento dalle impostazioni del progetto."
            footer={<WizardFooter onBack={onBack} onSkip={onSkip} onNext={onSubmit} loading={loading} nextLabel="Salva e continua" />}
        >
            <div className="flex flex-col gap-6">
                <div className="grid grid-cols-3 gap-3">
                    {PROVIDERS.map(p => (
                        <button
                            key={p.type}
                            type="button"
                            onClick={() => setType(p.type)}
                            className={cn(
                                "rounded-lg border-2 p-4 flex flex-col items-center gap-2 transition-colors",
                                type === p.type ? "border-primary bg-accent" : "border-border hover:border-primary/40"
                            )}
                        >
                            <img src={p.icon} alt={p.label} className="h-8 w-8 object-contain" />
                            <span className="text-sm font-medium text-foreground">{p.label}</span>
                        </button>
                    ))}
                </div>

                <Field label="Nome storage" value={name} onChange={setName} placeholder="Es. Bucket produzione" />

                {type === StorageType.AWS && (
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Region" value={f.region || ""} onChange={set("region")} placeholder="eu-west-1" />
                        <Field label="Bucket" value={f.bucketName || ""} onChange={set("bucketName")} placeholder="my-bucket" />
                        <Field label="Access Key ID" value={f.accessKeyId || ""} onChange={set("accessKeyId")} />
                        <Field label="Secret Access Key" value={f.secretAccessKey || ""} onChange={set("secretAccessKey")} type="password" />
                    </div>
                )}
                {type === StorageType.AZURE && (
                    <div className="grid grid-cols-1 gap-4">
                        <Field label="Connection String" value={f.connectionString || ""} onChange={set("connectionString")} type="password" />
                        <Field label="Container" value={f.containerName || ""} onChange={set("containerName")} placeholder="mfe-container" />
                    </div>
                )}
                {type === StorageType.GOOGLE && (
                    <div className="grid grid-cols-1 gap-4">
                        <Field label="Service Account JSON" value={f.jsonKey || ""} onChange={set("jsonKey")} placeholder='{ "type": "service_account", ... }' />
                        <Field label="Bucket" value={f.bucketName || ""} onChange={set("bucketName")} placeholder="my-bucket" />
                    </div>
                )}
            </div>
        </StepShell>
    )
}

export default Hosting
