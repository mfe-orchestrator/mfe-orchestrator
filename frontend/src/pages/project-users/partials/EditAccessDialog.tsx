import { zodResolver } from "@hookform/resolvers/zod"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Form, SelectField } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Button } from "@/components/atoms"
import { Domain } from "@/hooks/apiClients/useDomainsApi"
import { RoleInProject } from "@/hooks/apiClients/useProjectApi"
import useProjectUserApi, { ProjectUser, UpdateProjectUserDTO } from "@/hooks/apiClients/useProjectUserApi"
import useProjectStore from "@/store/useProjectStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { AccessFormValues, DomainAccessFields, refineDomainAccess, toDomainIds } from "./DomainAccessFields"

interface EditAccessDialogProps {
    user?: ProjectUser
    domains: Domain[]
    /** False while the domains are loading or could not be read: the scope cannot be shown, so it cannot be changed */
    domainsReady: boolean
    /** The user is the only owner of the project: they cannot be demoted */
    isLastOwner: boolean
    onOpenChange: (open: boolean) => void
}

const valuesOf = (user: ProjectUser | undefined, domains: Domain[]): AccessFormValues => {
    // Ids of deleted domains are ignored
    const known = (user?.domainIds ?? []).filter(id => domains.some(domain => domain._id === id))
    return {
        role: (user?.role as RoleInProject) ?? RoleInProject.VIEWER,
        access: user?.domainScoped ? "domains" : "all",
        domainIds: known
    }
}

/**
 * Whether the owner changed the access: the domains are sent only then, or when they make the member an owner,
 * which is always the whole project. Left out, the backend keeps the stored scope rather than widening one
 * nobody touched. The domains compare as a set: the order they were ticked in says nothing.
 */
const isScopeChanged = (values: AccessFormValues, initial: AccessFormValues) => {
    const before = new Set(initial.domainIds)
    const after = new Set(values.domainIds)
    return (values.role === RoleInProject.OWNER && initial.role !== RoleInProject.OWNER) || values.access !== initial.access || after.size !== before.size || [...after].some(id => !before.has(id))
}

export const EditAccessDialog: React.FC<EditAccessDialogProps> = ({ user, domains, domainsReady, isLastOwner, onOpenChange }) => {
    const { t } = useTranslation()
    const notifications = useToastNotificationStore()
    const projectUserApi = useProjectUserApi()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)

    // What the dialog opened with: the scope is checked, and sent, only when the owner changed it
    const initial = useRef(valuesOf(user, domains))

    const schema = useMemo(
        () =>
            z
                .object({
                    role: z.enum([RoleInProject.OWNER, RoleInProject.MEMBER, RoleInProject.VIEWER], { error: t("project_users.role_required") }),
                    access: z.enum(["all", "domains"]),
                    domainIds: z.array(z.string())
                })
                // A member scoped to domains since deleted keeps saving a new role without picking one
                .superRefine((values, ctx) => {
                    if (isScopeChanged(values, initial.current)) refineDomainAccess(values, ctx, t("project_users.access.domains_required"))
                }),
        [t]
    )

    const form = useForm<AccessFormValues>({ resolver: zodResolver(schema), defaultValues: initial.current })

    // Filled when another member is opened, or once the domains are read: not on a refetch of either while the
    // dialog is open, which would throw away what the owner is choosing
    const userId = user?._id
    // biome-ignore lint/correctness/useExhaustiveDependencies: the member opened and the domains becoming known are what must refill the form.
    useEffect(() => {
        if (!userId) return
        initial.current = valuesOf(user, domains)
        form.reset(initial.current)
    }, [userId, domainsReady, form])

    const updateMutation = useMutation({
        mutationFn: (dto: UpdateProjectUserDTO) => projectUserApi.updateProjectUser(projectId || "", user?._id || "", dto)
    })

    const onSubmit = async (values: AccessFormValues) => {
        if (isLastOwner && values.role !== RoleInProject.OWNER) {
            form.setError("role", { message: t("project_users.edit_access.last_owner") })
            return
        }
        await updateMutation.mutateAsync({ role: values.role, ...(isScopeChanged(values, initial.current) && { domainIds: toDomainIds(values) }) })
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
                                {/* Until the domains are known: the form is refilled then, and a role picked before would be lost */}
                                <SelectField
                                    name="role"
                                    label={t("project_users.role")}
                                    placeholder={t("project_users.select_role")}
                                    disabled={!domainsReady}
                                    options={[
                                        { value: "OWNER", label: t("project_users.roles.admin") },
                                        { value: "MEMBER", label: t("project_users.roles.editor") },
                                        { value: "VIEWER", label: t("project_users.roles.viewer") }
                                    ]}
                                />
                            </div>
                            <DomainAccessFields domains={domains} disabled={!domainsReady} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={updateMutation.isPending}>
                                {t("common.cancel")}
                            </Button>
                            <Button type="submit" disabled={!domainsReady} loading={updateMutation.isPending} loadingLabel={t("common.loading")} dataTestId="save-access">
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
