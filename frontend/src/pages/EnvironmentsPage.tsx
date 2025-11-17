import ApiDataFetcher from "@/components/ApiDataFetcher/ApiDataFetcher"
import ColorPicker from "@/components/input/ColorPicker.rhf"
import Switch from "@/components/input/Switch.rhf"
import TextareaField from "@/components/input/TextareaField.rhf"
import TextField from "@/components/input/TextField.rhf"
import SinglePageLayout from "@/components/SinglePageLayout"
import { Button } from "@/components/ui/button/button"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import useEnvironmentsApi, { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"
import useProjectApi from "@/hooks/apiClients/useProjectApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import EnvironmentsGate from "@/theme/EnvironmentsGate"
import { useQuery } from "@tanstack/react-query"
import { Pencil, PlusCircle, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { FormProvider, useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"

interface EnvironmentDialogFormData {
    name: string
    slug: string
    description?: string
    color?: string
    isProduction?: boolean
}

interface EnvironmentDialogProps {
    isOpen: boolean
    onOpenChange: (open: boolean) => void
    onSubmitSuccess?: () => Promise<void>
    formData: EnvironmentDialogFormData
    id?: string
}

function EnvironmentDialog({ isOpen, onOpenChange, onSubmitSuccess, formData, id }: EnvironmentDialogProps) {
    const { t } = useTranslation()
    const isEdit = Boolean(id)
    const form = useForm<EnvironmentDialogFormData>()
    const environemtnApi = useEnvironmentsApi()
    const notifications = useToastNotificationStore()

    const onSubmit = async (data: EnvironmentDialogFormData) => {
        if (isEdit) {
            await environemtnApi.editEnvironment(id, data)
            notifications.showSuccessNotification({
                message: t("environment.update_success")
            })
        } else {
            await environemtnApi.createEnvironment(data)
            notifications.showSuccessNotification({
                message: t("environment.create_success")
            })
        }

        await onSubmitSuccess?.()
    }

    useEffect(() => {
        if (!formData) {
            console.log("reset")
            form.reset({}, { keepValues: false, keepDirty: false })
        } else {
            form.reset(formData, { keepValues: false, keepDirty: false })
        }
    }, [formData, form.reset])

    return (
        <Dialog open={isOpen} onOpenChange={form.formState.isSubmitting ? undefined : onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{id ? t("environment.page.form.edit_title", { name: formData.name }) : t("environment.page.form.create_title")}</DialogTitle>
                </DialogHeader>
                <FormProvider {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <TextField
                            name="name"
                            label={t("environment.form.name")}
                            placeholder={t("environment.form.name_placeholder")}
                            rules={{
                                required: t("environment.form.name_required") as string
                            }}
                            required
                        />
                        <TextField
                            name="slug"
                            label={t("environment.form.slug")}
                            placeholder={t("environment.form.slug_placeholder")}
                            rules={{
                                required: t("environment.form.slug_required") as string
                            }}
                            disabled={isEdit}
                            required
                        />
                        <TextareaField name="description" label={t("environment.form.description")} placeholder={t("environment.form.description_placeholder")} />
                        <ColorPicker
                            name="color"
                            label={t("environment.color")}
                            rules={{
                                required: t("environment.form.color_required") as string
                            }}
                            required
                        />
                        <Switch name="isProduction" label={t("environment.is_production")} />
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={form.formState.isSubmitting}>
                                {t("environment.page.form.cancel")}
                            </Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {id ? t("environment.page.form.update") : t("environment.page.form.create")}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    )
}

export default function EnvironmentsPage() {
    const { t } = useTranslation()

    const { deleteEnvironment } = useEnvironmentsApi()
    const projectApi = useProjectApi()
    const notifications = useToastNotificationStore()
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [currentEnvironment, setCurrentEnvironment] = useState<EnvironmentDTO>()
    const { project } = useProjectStore()

    const environmentQuery = useQuery({
        queryKey: ["environments", project._id],
        queryFn: () => projectApi.getEnvironmentsByProjectId(project._id)
    })

    const onSubmitSuccess = async () => {
        await environmentQuery.refetch()
        setIsDialogOpen(false)
    }

    const handleEdit = (env: EnvironmentDTO) => {
        setCurrentEnvironment(env)
        setIsDialogOpen(true)
    }

    const getRandomColor = () => {
        return (
            "#" +
            Math.floor(Math.random() * 16777215)
                .toString(16)
                .padStart(6, "0")
        )
    }

    const openCreateDialog = () => {
        setCurrentEnvironment({
            name: "",
            slug: "",
            description: "",
            color: getRandomColor(),
            isProduction: false
        })
        setIsDialogOpen(true)
    }

    const handleDelete = async () => {
        if (!currentEnvironment?._id) return

        await deleteEnvironment(currentEnvironment._id)
        await environmentQuery.refetch()
        notifications.showSuccessNotification({
            message: t("environment.page.delete.success", { name: currentEnvironment.name })
        })
    }

    return (
        <SinglePageLayout
            title={t("environment.page.title")}
            description={t("environment.page.description")}
            right={
                !environmentQuery.isLoading && environmentQuery.data?.length != 0 ? (
                    <Button onClick={openCreateDialog}>
                        <PlusCircle />
                        {t("environment.page.new_environment")}
                    </Button>
                ) : null
            }
        >
                <EnvironmentsGate
                    onSaveSuccess={() => {
                        environmentQuery.refetch()
                    }}
                >
                    <ApiDataFetcher queries={[environmentQuery]}>
                    <div className="rounded-md border-2 border-border overflow-hidden">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-primary/25">
                                    <TableHead>{t("environment.form.name")}</TableHead>
                                    <TableHead>{t("environment.form.slug")}</TableHead>
                                    <TableHead>{t("environment.production")}</TableHead>
                                    <TableHead>{t("environment.page.color")}</TableHead>
                                    <TableHead />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {environmentQuery.data?.map(env => (
                                    <TableRow key={env._id}>
                                        <TableCell className="font-medium">{env.name}</TableCell>
                                        <TableCell>{env.slug}</TableCell>
                                        <TableCell>{env.isProduction ? "Yes" : "No"}</TableCell>
                                        <TableCell>
                                            <div className="w-6 h-6 rounded-full border-2 border-border" style={{ backgroundColor: env.color }} />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(env)}>
                                                    <Pencil />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-destructive hover:bg-destructive/15 hover:text-destructive-active"
                                                    onClick={() => {
                                                        setCurrentEnvironment(env)
                                                        setIsDeleteDialogOpen(true)
                                                    }}
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    </ApiDataFetcher>
                </EnvironmentsGate>

                {/* Create/Edit Dialog */}
                <EnvironmentDialog isOpen={isDialogOpen} onOpenChange={setIsDialogOpen} id={currentEnvironment?._id} onSubmitSuccess={onSubmitSuccess} formData={currentEnvironment} />

                {/* Delete Confirmation Dialog */}
                <DeleteConfirmationDialog
                    isOpen={isDeleteDialogOpen}
                    onOpenChange={setIsDeleteDialogOpen}
                    onDelete={handleDelete}
                    title={t("environment.page.delete.title")}
                    description={t("environment.page.delete.confirmation", { name: currentEnvironment?.name || "" })}
            />
        </SinglePageLayout>
    )
}
