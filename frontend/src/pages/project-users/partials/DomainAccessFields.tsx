import { Checkbox, SelectField } from "@mfe-orchestrator/design-system"
import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import { Domain } from "@/hooks/apiClients/useDomainsApi"
import { RoleInProject } from "@/hooks/apiClients/useProjectApi"

export type AccessScope = "all" | "domains"

export interface AccessFormValues {
    role: RoleInProject
    access: AccessScope
    domainIds: string[]
}

/** Only a member or a viewer can be limited to some domains: an owner is always whole project */
export const isScopedAccess = (values: Pick<AccessFormValues, "role" | "access">) => values.role !== RoleInProject.OWNER && values.access === "domains"

/** The domain ids to send: empty means the whole project */
export const toDomainIds = (values: AccessFormValues): string[] => (isScopedAccess(values) ? values.domainIds : [])

/** Refinement shared by the forms: "Specific domains" needs at least one domain */
export const refineDomainAccess = (values: AccessFormValues, ctx: z.RefinementCtx, message: string) => {
    if (isScopedAccess(values) && values.domainIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["domainIds"], message })
    }
}

interface DomainAccessFieldsProps {
    domains: Domain[]
    /** While the domains are not known yet the choice cannot be made: "Whole project" would be the only one shown */
    disabled?: boolean
}

/** The "Access" choice of a project member: whole project or specific domains. Lives inside a react-hook-form Form. */
export const DomainAccessFields: React.FC<DomainAccessFieldsProps> = ({ domains, disabled }) => {
    const { t } = useTranslation()
    const form = useFormContext<AccessFormValues>()
    const role = form.watch("role")
    const access = form.watch("access")
    const domainIds = form.watch("domainIds")

    if (role === RoleInProject.OWNER) return null

    // A member whose domains were all deleted is still scoped: the choice stays, or the owner could not widen them
    // again, nor take back "Whole project" once picked
    if (domains.length === 0 && !disabled && access !== "domains" && form.formState.defaultValues?.access !== "domains") {
        return (
            <div className="space-y-1" data-testid="member-access-whole-project">
                <span className="text-sm font-medium">{t("project_users.access.label")}</span>
                <p className="text-sm text-foreground-secondary">{t("project_users.access.no_domains_hint")}</p>
            </div>
        )
    }

    const toggle = (id: string) =>
        form.setValue("domainIds", domainIds.includes(id) ? domainIds.filter(selected => selected !== id) : [...domainIds, id], { shouldDirty: true, shouldValidate: form.formState.isSubmitted })

    return (
        <div className="space-y-3">
            <div data-testid="member-access">
                <SelectField
                    name="access"
                    label={t("project_users.access.label")}
                    disabled={disabled}
                    options={[
                        { value: "all", label: t("project_users.access.whole_project") },
                        { value: "domains", label: t("project_users.access.specific_domains") }
                    ]}
                />
            </div>
            {access === "domains" && (
                <div className="space-y-2">
                    <span className="text-sm font-medium">{t("project_users.access.domains_label")}</span>
                    {domains.length === 0 && <p className="text-sm text-foreground-secondary">{t("project_users.access.no_domains_scoped")}</p>}
                    <ul className="max-h-48 divide-y divide-divider overflow-y-auto rounded-md border border-divider" data-testid="member-access-domains">
                        {domains.map(domain => (
                            <li key={domain._id}>
                                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-primary/5">
                                    <Checkbox checked={domainIds.includes(domain._id)} disabled={disabled} onCheckedChange={() => toggle(domain._id)} />
                                    <span className="truncate text-sm">{domain.name}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    {form.formState.errors.domainIds?.message && <p className="text-sm text-destructive">{form.formState.errors.domainIds.message}</p>}
                </div>
            )}
        </div>
    )
}

export default DomainAccessFields
