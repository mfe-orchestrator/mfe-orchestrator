import { useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { StepShell, WizardFooter, WizardStepProps } from "./wizardShared"

interface MainDataForm {
    name: string
    description?: string
}

const slugify = (value: string) =>
    value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

const MainData: React.FC<WizardStepProps> = ({ project, onCreated }) => {
    const projectApi = useProjectApi()
    const notifications = useToastNotificationStore()
    const [loading, setLoading] = useState(false)
    const form = useForm<MainDataForm>({ defaultValues: { name: project?.name ?? "", description: project?.description ?? "" } })

    const onSubmit = async (data: MainDataForm) => {
        setLoading(true)
        try {
            const created = await projectApi.createProject({
                name: data.name,
                slug: slugify(data.name),
                description: data.description
            })
            notifications.showSuccessNotification({ message: `Progetto "${created.name}" creato` })
            onCreated?.(created)
        } catch {
            notifications.showErrorNotification({ message: "Impossibile creare il progetto" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <StepShell
                    title="Diamo un nome al progetto"
                    description="Il nome identifica il progetto nella console. Potrai modificarlo in seguito dalle impostazioni."
                    footer={<WizardFooter loading={loading} nextLabel="Crea progetto" />}
                >
                    <div className="flex flex-col gap-4">
                        <TextField<MainDataForm>
                            name="name"
                            label="Nome progetto"
                            placeholder="Es. Portale Clienti"
                            required
                            rules={{ required: "Il nome è obbligatorio", minLength: { value: 3, message: "Minimo 3 caratteri" } }}
                        />
                        <TextareaField<MainDataForm> name="description" label="Descrizione (opzionale)" placeholder="A cosa serve questo progetto?" />
                    </div>
                </StepShell>
            </form>
        </FormProvider>
    )
}

export default MainData
