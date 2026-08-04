import { Plus, Trash2, Users } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { Input } from "@/components/ui/input/input"
import useProjectApi, { RoleInProject } from "@/hooks/apiClients/useProjectApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

interface Row {
    email: string
    role: RoleInProject
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const TeamMates: React.FC<WizardStepProps> = ({ project, onNext, onBack, onSkip, loading: transitionLoading }) => {
    const { t } = useTranslation()
    const projectApi = useProjectApi()
    const notifications = useToastNotificationStore()
    const [loading, setLoading] = useState(false)
    const [rows, setRows] = useState<Row[]>([{ email: "", role: RoleInProject.VIEWER }])

    // Same role values/labels as the real invite form (AddUserButton)
    const ROLES = [
        { value: RoleInProject.OWNER, label: t("project_users.roles.admin") },
        { value: RoleInProject.MEMBER, label: t("project_users.roles.editor") },
        { value: RoleInProject.VIEWER, label: t("project_users.roles.viewer") }
    ]

    const update = (i: number, patch: Partial<Row>) => setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    const addRow = () => setRows(prev => [...prev, { email: "", role: RoleInProject.VIEWER }])
    const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

    const onFinish = async () => {
        const valid = rows.filter(r => r.email.trim())
        if (valid.length === 0) {
            onNext()
            return
        }
        const invalid = valid.find(r => !EMAIL_RE.test(r.email.trim()))
        if (invalid) {
            notifications.showWarningNotification({ message: `Email non valida: ${invalid.email}` })
            return
        }
        if (!project?._id) {
            onNext()
            return
        }
        setLoading(true)
        try {
            await Promise.all(valid.map(r => projectApi.inviteUser({ projectId: project._id, email: r.email.trim(), role: r.role })))
            onNext()
        } catch {
            notifications.showErrorNotification({ message: "Alcuni inviti non sono stati inviati" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <StepShell
            title="Invita i collaboratori"
            description="Aggiungi le persone che lavoreranno al progetto. Riceveranno un invito via email. Puoi saltare e invitarle più tardi."
            skippableNote="Nessuna fretta: puoi invitare o rimuovere collaboratori in qualsiasi momento dalle impostazioni del progetto."
            footer={<WizardFooter onBack={onBack} onSkip={onSkip} skipLabel="Salta e completa" onNext={onFinish} loading={loading || transitionLoading} nextLabel="Completa" />}
        >
            <div className="flex flex-col gap-3">
                {rows.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <Input
                            type="email"
                            data-testid={`wizard-collaborator-email-${i}`}
                            value={row.email}
                            onChange={e => update(i, { email: e.target.value })}
                            placeholder="collega@azienda.com"
                            className="flex-1"
                        />
                        <select
                            value={row.role}
                            onChange={e => update(i, { role: e.target.value as RoleInProject })}
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                            {ROLES.map(r => (
                                <option key={r.value} value={r.value}>
                                    {r.label}
                                </option>
                            ))}
                        </select>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeRow(i)} disabled={rows.length === 1} aria-label="Rimuovi collaboratore">
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                ))}

                <div>
                    <Button type="button" variant="ghost" size="sm" onClick={addRow}>
                        <Plus className="size-4" /> Aggiungi collaboratore
                    </Button>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/60 p-4 text-sm text-foreground-secondary mt-2">
                    <Users className="size-5 text-primary shrink-0 mt-0.5" />
                    <span>I collaboratori invitati potranno accedere al progetto in base al ruolo assegnato.</span>
                </div>
            </div>
        </StepShell>
    )
}

export default TeamMates
