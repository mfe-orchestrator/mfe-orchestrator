import { zodResolver } from "@hookform/resolvers/zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Form, SelectField } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button } from "@/components/atoms"
import { RoleInProject } from "@/hooks/apiClients/useProjectApi"
import useProjectUserApi, { ProjectUser, UpdateProjectUserDTO } from "@/hooks/apiClients/useProjectUserApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"

interface EditAccessDialogProps {
    user?: ProjectUser
    /** The user is the only owner of the project: they cannot be demoted */
    isLastOwner: boolean
    onOpenChange: (open: boolean) => void
}

interface AccessFormValues {
    role: RoleInProject
}

export const EditAccessDialog: React.FC<EditAccessDialogProps> = ({ user, isLastOwner, onOpenChange }) => {
    const { t } = useTranslation()
    const notifications = useToastNotificationStore()
    const projectUserApi = useProjectUserApi()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)

    const schema = useMemo(() => z.object({ role: z.enum([RoleInProject.OWNER, RoleInProject.MEMBER, RoleInProject.VIEWER], { error: t("project_users.role_required") }) }), [t])

    const form = useForm<AccessFormValues>({ resolver: zodResolver(schema), defaultValues: { role: RoleInProject.VIEWER } })

    // Filled when another member is opened: not on a refetch of the members while the dialog is open, which would
    // throw away what the owner is choosing
    const userId = user?._id
    // biome-ignore lint/correctness/useExhaustiveDependencies: the member opened is what must refill the form.
    useEffect(() => {
        if (!userId) return
        form.reset({ role: (user?.role as RoleInProject) ?? RoleInProject.VIEWER })
    }, [userId, form])

    const updateMutation = useMutation({
        mutationFn: (dto: UpdateProjectUserDTO) => projectUserApi.updateProjectUser(projectId || "", user?._id || "", dto)
    })

    const onSubmit = async (values: AccessFormValues) => {
        if (isLastOwner && values.role !== RoleInProject.OWNER) {
            form.setError("role", { message: t("project_users.edit_access.last_owner") })
            return
        }
        await updateMutation.mutateAsync({ role: values.role })
        notifications.showSuccessNotification({ message: t("project_users.edit_access.success") })
        onOpenChange(false)
        await Promise.all([queryClient.invalidateQueries({ queryKey: ["projectUsers", projectId] }), queryClient.invalidateQueries({ queryKey: ["project-summary", projectId] })])
    }

    return (
        <Dialog open={!!user} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{t("project_users.edit_access.title")}</DialogTitle>
                            <DialogDescription>{t("project_users.edit_access.description", { name: user?.name || user?.email })}</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div data-testid="edit-access-role">
                                <SelectField
                                    name="role"
                                    label={t("project_users.role")}
                                    placeholder={t("project_users.select_role")}
                                    options={[
                                        { value: "OWNER", label: t("project_users.roles.admin") },
                                        { value: "MEMBER", label: t("project_users.roles.editor") },
                                        { value: "VIEWER", label: t("project_users.roles.viewer") }
                                    ]}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" loading={updateMutation.isPending} loadingLabel={t("common.loading")} dataTestId="save-access">
                                {t("common.save")}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

export default EditAccessDialog
