import { Tabs, TabsContent, TabsList, TabsTrigger } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { Building2, Cpu, Users } from "lucide-react"
import React from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import useOrganizationApi, { canAdministerOrganization } from "@/hooks/apiClients/useOrganizationApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import { ORGANIZATION_USERS_QUERY_KEY, OrganizationAiModelsSection, OrganizationDetailsSection, OrganizationMembersSection } from "./partials"

const TABS = ["general", "members", "ai"] as const
type Tab = (typeof TABS)[number]

const TAB_ICONS: Record<Tab, React.ComponentType> = { general: Building2, members: Users, ai: Cpu }

/**
 * The settings of the organization, one concern per tab: its details and deletion, the people in it, the AIs its
 * projects use. The tab lives in the URL (`?tab=members`) so that a link can point straight to one of them.
 */
const OrganizationSettings: React.FC = () => {
    const { t } = useTranslation()
    const { organization } = useOrganizationStore()
    const organizationApi = useOrganizationApi()
    const [searchParams, setSearchParams] = useSearchParams()

    const requestedTab = searchParams.get("tab")
    const tab: Tab = TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : "general"

    const canAdminister = canAdministerOrganization(organization)

    const usersQuery = useQuery({
        queryKey: [ORGANIZATION_USERS_QUERY_KEY, organization?._id],
        queryFn: () => organizationApi.getOrganizationUsers(organization?._id || ""),
        enabled: !!organization?._id
    })

    // Read for the project count alone: it is what decides whether the organization can be deleted.
    const summaryQuery = useQuery({
        queryKey: ["organization-summary", organization?._id],
        queryFn: () => organizationApi.getOrganizationSummary(organization?._id || ""),
        enabled: !!organization?._id
    })

    const memberCount = (usersQuery.data ?? []).filter(user => !user.invitationPending).length

    return (
        <ApiStatusHandler queries={[usersQuery, summaryQuery]}>
            <SinglePageLayout title={t("organization.settings")} description={t("organization.settings_subtitle", { organization: organization?.name ?? "" })}>
                {organization && (
                    <Tabs value={tab} onValueChange={value => setSearchParams({ tab: value }, { replace: true })}>
                        <TabsList aria-label={t("organization.tabs.label")}>
                            {TABS.map(value => {
                                const Icon = TAB_ICONS[value]
                                return (
                                    <TabsTrigger key={value} value={value} dataTestId={`organization-tab-${value}`}>
                                        <Icon />
                                        {t(`organization.tabs.${value}`)}
                                        {value === "members" && <span className="text-xs tabular-nums opacity-70">{memberCount}</span>}
                                    </TabsTrigger>
                                )
                            })}
                        </TabsList>

                        <TabsContent value="general" className="mt-6">
                            <OrganizationDetailsSection organization={organization} projectCount={summaryQuery.data?.count.projects ?? 0} canAdminister={canAdminister} />
                        </TabsContent>

                        <TabsContent value="members" className="mt-6">
                            <OrganizationMembersSection organization={organization} users={usersQuery.data ?? []} canAdminister={canAdminister} />
                        </TabsContent>

                        <TabsContent value="ai" className="mt-6">
                            <OrganizationAiModelsSection organizationId={organization._id} canAdminister={canAdminister} />
                        </TabsContent>
                    </Tabs>
                )}
            </SinglePageLayout>
        </ApiStatusHandler>
    )
}

export default OrganizationSettings
