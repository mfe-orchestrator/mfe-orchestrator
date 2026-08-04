import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import { Project } from "@/hooks/apiClients/useProjectApi"
import { WizardMainDataDTO } from "@/hooks/apiClients/useProjectWizardClient"
import { StepShell, WizardFooter } from "./wizardShared"

interface MainDataProps {
    project?: Project
    /**
     * Creates the project (wizard start) or updates it and moves on: in both
     * cases it is the backend that decides which step follows.
     */
    onSubmitMainData: (data: WizardMainDataDTO) => Promise<void>
    loading?: boolean
    submitLabel?: string
}

const MainData: React.FC<MainDataProps> = ({ project, onSubmitMainData, loading, submitLabel }) => {
    const [submitting, setSubmitting] = useState(false)
    const form = useForm<WizardMainDataDTO>({ defaultValues: { name: project?.name ?? "", description: project?.description ?? "" } })

    const onSubmit = async (data: WizardMainDataDTO) => {
        setSubmitting(true)
        try {
            await onSubmitMainData(data)
        } finally {
            setSubmitting(false)
        }
    }

    const busy = loading || submitting

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <StepShell
                    title="Diamo un nome al progetto"
                    description="Il nome identifica il progetto nella console. Potrai modificarlo in seguito dalle impostazioni."
                    footer={<WizardFooter loading={busy} nextLabel={submitLabel ?? (project ? "Salva e continua" : "Crea progetto")} />}
                >
                    <div className="flex flex-col gap-4">
                        <TextField<WizardMainDataDTO>
                            name="name"
                            label="Nome progetto"
                            placeholder="Es. Portale Clienti"
                            required
                            dataTestId="wizard-project-name"
                            rules={{ required: "Il nome è obbligatorio", minLength: { value: 3, message: "Minimo 3 caratteri" } }}
                        />
                        <TextareaField<WizardMainDataDTO> name="description" label="Descrizione (opzionale)" placeholder="A cosa serve questo progetto?" />
                    </div>
                </StepShell>
            </form>
        </FormProvider>
    )
}

export default MainData
