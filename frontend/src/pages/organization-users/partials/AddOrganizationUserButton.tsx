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
import useOrganizationApi, { RoleInOrganization } from "@/hooks/apiClients/useOrganizationApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import useUserStore from "@/store/useUserStore"

interface InviteUserFormValues {
    email: string
    role: RoleInOrganization
}

export const ORGANIZATION_USERS_QUERY_KEY = "organizationUsers"

export const AddOrganizationUserButton: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const notifications = useToastNotificationStore()
    const organizationApi = useOrganizationApi()
    const { organization } = useOrganizationStore()
    const queryClient = useQueryClient()
    const currentUserEmail = useUserStore(state => state.user?.email?.toLowerCase())

    // Same key as the page around it, and no refetch on mount: the button lives inside the page's
    // ApiStatusHandler, which treats a background refetch as loading and would unmount the button.
    const usersQuery = useQuery({
        queryKey: [ORGANIZATION_USERS_QUERY_KEY, organization?._id],
        queryFn: () => organizationApi.getOrganizationUsers(organization?._id || ""),
        enabled: !!organization?._id,
        refetchOnMount: false
    })

    const schema = useMemo(
        () =>
            z.object({
                email: z.string().email(t("auth.invalid_email")),
                role: z.enum([RoleInOrganization.OWNER, RoleInOrganization.ADMIN, RoleInOrganization.MEMBER], {
                    required_error: t("organization_users.role_required")
                })
            }),
        [t]
    )

    const form = useForm<InviteUserFormValues>({
        resolver: zodResolver(schema),
        defaultValues: { email: "", role: RoleInOrganization.MEMBER }
    })

    const inviteMutation = useMutation({
        mutationFn: (values: InviteUserFormValues) => organizationApi.inviteUser({ ...values, organizationId: organization?._id || "" })
    })

    const onSubmit = async (values: InviteUserFormValues) => {
        const email = values.email.trim().toLowerCase()
        if (currentUserEmail && email === currentUserEmail) {
            form.setError("email", { message: t("organization_users.cannot_invite_self") })
            return
        }
        const existing = (usersQuery.data ?? []).find(user => user.email.toLowerCase() === email)
        if (existing) {
            form.setError("email", { message: existing.invitationPending ? t("organization_users.already_invited") : t("organization_users.already_member") })
            return
        }

        await inviteMutation.mutateAsync({ ...values, email })
        notifications.showSuccessNotification({ message: t("organization_users.invite_success") })
        setIsOpen(false)
        form.reset()
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: [ORGANIZATION_USERS_QUERY_KEY, organization?._id] }),
            queryClient.invalidateQueries({ queryKey: ["organization-summary", organization?._id] })
        ])
        onSuccess?.()
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button dataTestId="invite-organization-user">
                    <UserRoundPlus />
                    {t("organization_users.invite_user")}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{t("organization_users.invite_user_modal_title")}</DialogTitle>
                            <DialogDescription>{t("organization_users.invite_user_modal_description")}</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <TextField name="email" label={t("auth.email")} placeholder={t("auth.email_placeholder")} type="email" dataTestId="invite-organization-user-email" />
                            {/* SelectField non espone un test id: il wrapper dà ai test un aggancio stabile sul trigger. */}
                            <div data-testid="invite-organization-user-role">
                                <SelectField
                                    name="role"
                                    label={t("organization_users.role")}
                                    placeholder={t("organization_users.select_role")}
                                    options={[
                                        { value: RoleInOrganization.OWNER, label: t("organization_users.roles.owner") },
                                        { value: RoleInOrganization.ADMIN, label: t("organization_users.roles.admin") },
                                        { value: RoleInOrganization.MEMBER, label: t("organization_users.roles.member") }
                                    ]}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={inviteMutation.isPending}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" loading={inviteMutation.isPending} loadingLabel={t("common.loading")} dataTestId="send-organization-invitation">
                                {t("organization_users.send_invitation")}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    )
}

export default AddOrganizationUserButton
