import { zodResolver } from "@hookform/resolvers/zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Form, SelectField } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { UserRoundPlus } from "lucide-react"
import { useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button } from "@/components/atoms"
import TextField from "@/components/input/TextField.rhf"
import useProjectApi, { RoleInProject } from "@/hooks/apiClients/useProjectApi"
import useProjectUserApi from "@/hooks/apiClients/useProjectUserApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import useUserStore from "@/store/useUserStore"

interface InviteUserFormValues {
    email: string
    role: RoleInProject
}

interface AddUserButtonProps {
    onSuccess?: () => void
}

export const AddUserButton: React.FC<AddUserButtonProps> = ({ onSuccess }) => {
    const { t } = useTranslation()
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
    const notifications = useToastNotificationStore()
    const projectApi = useProjectApi()
    const projectUserApi = useProjectUserApi()
    const { project } = useProjectStore()
    const queryClient = useQueryClient()
    const currentUserEmail = useUserStore(state => state.user?.email?.toLowerCase())

    // Same key as the ProjectUsers page, so this reads from the already-fetched cache
    const projectUsersQuery = useQuery({
        queryKey: ["projectUsers", project?._id],
        queryFn: () => projectUserApi.getProjectUsers(project?._id || ""),
        enabled: !!project?._id
    })

    const inviteUserSchema = useMemo(
        () =>
            z.object({
                email: z.string().email(t("auth.invalid_email")),
                role: z.enum([RoleInProject.OWNER, RoleInProject.MEMBER, RoleInProject.VIEWER], {
                    required_error: t("project_users.role_required")
                })
            }),
        [t]
    )

    const form = useForm<InviteUserFormValues>({
        resolver: zodResolver(inviteUserSchema),
        defaultValues: {
            email: "",
            role: RoleInProject.VIEWER
        }
    })

    const inviteUserMutation = useMutation({
        mutationFn: projectApi.inviteUser
    })

    const onSubmit = async (values: InviteUserFormValues) => {
        const email = values.email.trim().toLowerCase()
        if (currentUserEmail && email === currentUserEmail) {
            form.setError("email", { message: t("project_users.cannot_invite_self") })
            return
        }
        const existing = (projectUsersQuery.data ?? []).find(u => u.email.toLowerCase() === email)
        if (existing) {
            form.setError("email", { message: existing.invitationPending ? t("project_users.already_invited") : t("project_users.already_member") })
            return
        }
        await inviteUserMutation.mutateAsync({
            email: values.email!,
            role: values.role,
            projectId: project._id
        })
        notifications.showSuccessNotification({
            message: t("project_users.invite_success")
        })
        setIsInviteModalOpen(false)
        form.reset()
        // Refresh the users list (and the summary counters) so the invited user shows up right away
        await Promise.all([queryClient.invalidateQueries({ queryKey: ["projectUsers", project?._id] }), queryClient.invalidateQueries({ queryKey: ["project-summary", project?._id] })])
        onSuccess?.()
    }

    return (
        <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
            <DialogTrigger asChild>
                <Button>
                    <UserRoundPlus />
                    {t("project_users.invite_user")}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{t("project_users.invite_user_modal_title")}</DialogTitle>
                            <DialogDescription>{t("project_users.invite_user_modal_description")}</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <TextField name="email" label={t("auth.email")} placeholder={t("auth.email_placeholder")} type="email" />
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
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setIsInviteModalOpen(false)} disabled={inviteUserMutation.isPending}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={inviteUserMutation.isPending}>
                                {inviteUserMutation.isPending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : t("project_users.send_invitation")}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

export default AddUserButton
