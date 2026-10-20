import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { Domain } from "@/hooks/apiClients/useDomainsApi"
import { ProjectUser } from "@/hooks/apiClients/useProjectUserApi"

interface MemberDomainScopeProps {
    user: ProjectUser
    domains: Domain[]
}

/** Whole project, or the names of the domains the member is limited to */
export const MemberDomainScope: React.FC<MemberDomainScopeProps> = ({ user, domains }) => {
    const { t } = useTranslation()
    if (!user.domainScoped) return <Badge variant="outline">{t("project_users.access.whole_project")}</Badge>

    // Unknown or deleted ids are ignored: a member whose every domain is gone reaches none, not the whole project
    const ids = user.domainIds ?? []
    const names = domains.filter(domain => ids.includes(domain._id)).map(domain => domain.name)
    if (names.length === 0) return <Badge variant="outline">{t("project_users.access.no_domain")}</Badge>

    return (
        <div className="flex flex-wrap gap-1" data-testid={`member-scope-${user.email}`}>
            {names.map(name => (
                <Badge key={name} variant="outline">
                    {name}
                </Badge>
            ))}
        </div>
    )
}

export default MemberDomainScope
