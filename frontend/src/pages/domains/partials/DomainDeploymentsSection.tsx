import { Card, CardContent, CardDescription, CardHeader, CardTitle, ColorSwatch } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { LayoutDashboard, Rocket, Server } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import useDomainDeploymentsApi, { DeployedMicrofrontend, EnvironmentDeployment } from "@/hooks/apiClients/useDomainDeploymentsApi"
import { CanaryType } from "@/hooks/apiClients/useMicrofrontendsApi"
import useThemeStore from "@/store/useThemeStore"

interface DeployedVersionProps {
    version: string | null
    canary?: DeployedMicrofrontend["canary"]
    /** Shown when there is no version: the frontend was not deployed, the backend was not reported */
    emptyLabel: string
}

/** A version as deployed, e.g. `1.2.0 · canary 3.0.0 (10%)`, or the empty label when there is none */
export const DeployedVersion: React.FC<DeployedVersionProps> = ({ version, canary, emptyLabel }) => {
    const { t } = useTranslation()
    if (!version) {
        return <span className="italic text-foreground-secondary">{emptyLabel}</span>
    }
    // ON_USER ignores the percentage: the canary goes to the users enrolled on the deployment
    const audience = canary && (canary.type === CanaryType.ON_USER ? t("domains.deployments.canary_enrolled_users") : `${canary.percentage}%`)
    return (
        <span className="font-mono text-xs">
            {version}
            {canary && ` · ${canary.version ? t("domains.deployments.canary", { version: canary.version, audience }) : t("domains.deployments.canary_without_version", { audience })}`}
        </span>
    )
}

/** Name and colour of an environment, with the deployment it serves */
export const EnvironmentHeading: React.FC<{ entry: EnvironmentDeployment }> = ({ entry }) => {
    const { t } = useTranslation()
    const themeStore = useThemeStore()
    return (
        <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-2 font-medium">
                <ColorSwatch size="sm" color={entry.environment.color} />
                <span className="truncate">{entry.environment.name}</span>
                {entry.environment.isProduction && <Badge className="shrink-0">{t("domains.deployments.production")}</Badge>}
            </span>
            <span className="text-xs font-normal text-foreground-secondary">
                {entry.deployment
                    ? t("domains.deployments.deployment", {
                          deploymentId: entry.deployment.deploymentId,
                          date: format(new Date(entry.deployment.deployedAt), "PPp", { locale: themeStore.getLocale() })
                      })
                    : t("domains.deployments.never_deployed")}
            </span>
        </div>
    )
}

interface MemberListProps {
    title: string
    icon: React.ReactNode
    emptyLabel: string
    members: { _id: string; slug: string; name: string; version: string | null; canary?: DeployedMicrofrontend["canary"] }[]
}

const MemberList: React.FC<MemberListProps> = ({ title, icon, emptyLabel, members }) =>
    members.length === 0 ? null : (
        <div className="flex flex-col gap-1">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-foreground-secondary">
                {icon}
                {title}
            </h4>
            <ul className="divide-y divide-divider">
                {members.map(member => (
                    <li key={member._id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate" title={member.slug}>
                            {member.name}
                        </span>
                        <span className="shrink-0 text-right">
                            <DeployedVersion version={member.version} canary={member.canary} emptyLabel={emptyLabel} />
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    )

/**
 * Which version of each microfrontend and service of the domain runs in each environment: the
 * frontend from the deployment the environment serves, the backend from what the deploy pipeline reported.
 */
const DomainDeploymentsSection: React.FC<{ domainId: string }> = ({ domainId }) => {
    const { t } = useTranslation()
    const domainDeploymentsApi = useDomainDeploymentsApi()
    const deploymentsQuery = useQuery({ queryKey: ["domain-deployments", domainId], queryFn: () => domainDeploymentsApi.getByDomainId(domainId) })

    const environments = deploymentsQuery.data?.environments ?? []
    const hasMembers = environments.some(entry => entry.microfrontends.length > 0 || entry.services.length > 0)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="mb-0 flex items-center gap-2">
                    <Rocket className="size-5" aria-hidden="true" />
                    {t("domains.deployments.title")}
                </CardTitle>
                <CardDescription>{t("domains.deployments.description")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
                <ApiStatusHandler queries={[deploymentsQuery]}>
                    {environments.length === 0 ? (
                        <p className="text-sm text-foreground-secondary">{t("domains.deployments.no_environments")}</p>
                    ) : !hasMembers ? (
                        <p className="text-sm text-foreground-secondary">{t("domains.deployments.no_members")}</p>
                    ) : (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-4">
                            {environments.map(entry => (
                                <div key={entry.environment._id} className="flex flex-col gap-3 rounded-md border border-divider p-3" data-testid={`domain-deployments-${entry.environment.slug}`}>
                                    <EnvironmentHeading entry={entry} />
                                    <MemberList
                                        title={t("domains.deployments.frontend")}
                                        icon={<LayoutDashboard className="size-3.5" aria-hidden="true" />}
                                        emptyLabel={t("domains.deployments.not_deployed")}
                                        members={entry.microfrontends}
                                    />
                                    <MemberList
                                        title={t("domains.deployments.backend")}
                                        icon={<Server className="size-3.5" aria-hidden="true" />}
                                        emptyLabel={t("domains.deployments.not_reported")}
                                        members={entry.services}
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </ApiStatusHandler>
            </CardContent>
        </Card>
    )
}

export default DomainDeploymentsSection
