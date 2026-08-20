import { Spinner } from "@mfe-orchestrator/design-system"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import AuthenticationLayout from "@/authentication/components/AuthenticationLayout"
import CreateOrganizationForm from "@/components/CreateOrganizationForm"
import OrganizationPickerList from "@/components/OrganizationPickerList"
import { ApiStatusHandler } from "@/components/organisms"
import PendingInvitationsList, { usePendingOrganizationInvitationsQuery } from "@/components/PendingInvitationsList"
import useOrganizationApi, { ORGANIZATIONS_QUERY_KEY, Organization } from "@/hooks/apiClients/useOrganizationApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import useProjectStore from "@/store/useProjectStore"
import { clearProjectIdInLocalStorage, getOrganizationIdFromLocalStorage, setOrganizationIdInLocalStorage } from "@/utils/localStorageUtils"

const SelectOrganizationForm: React.FC<{ organizations: Organization[]; onSelect: (organization: Organization) => void; onCreated: (organization: Organization) => void }> = ({
    organizations,
    onSelect,
    onCreated
}) => {
    const { t } = useTranslation()
    const [isCreating, setIsCreating] = useState(organizations.length === 0)

    return (
        <AuthenticationLayout
            title={isCreating ? t("organization.create_title") : t("organization.select_title")}
            description={isCreating ? t("organization.create_desc") : t("organization.select_desc")}
            size="lg"
        >
            {/* Invitations come first: they are the only thing on this screen that still needs an answer. */}
            <PendingInvitationsList kind="organization" className="mb-4" />
            {isCreating ? (
                <CreateOrganizationForm onCreated={onCreated} onCancel={organizations.length > 0 ? () => setIsCreating(false) : undefined} />
            ) : (
                <OrganizationPickerList organizations={organizations} onSelect={onSelect} onCreateNew={() => setIsCreating(true)} variant="grid" autoFocusSearch />
            )}
        </AuthenticationLayout>
    )
}

/**
 * Puts an organization in front of everything else in the app.
 *
 * Every project belongs to exactly one organization, so which one is in use has to be settled before a
 * project can be picked at all — and it is what scopes the project list underneath.
 */
const SelectOrganizationWrapperInner: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { organization, organizations = [], setOrganization } = useOrganizationStore()
    const { setProject } = useProjectStore()
    const queryClient = useQueryClient()
    // Same query key as the list inside, so this reads the cached answer instead of fetching again.
    const invitationsQuery = usePendingOrganizationInvitationsQuery()

    // Whether the user has somewhere to go depends on the invitations too, so hold on until they arrive.
    if (organizations.length === 0 && invitationsQuery.isPending) {
        return (
            <div className="flex min-h-[200px] items-center justify-center">
                <Spinner />
            </div>
        )
    }

    const select = (selected: Organization) => {
        setOrganization(selected)
        setOrganizationIdInLocalStorage(selected._id)
        // The project in use belonged to the previous organization: keeping it would show its data
        // under a tenant it does not belong to.
        clearProjectIdInLocalStorage()
        setProject(undefined)
        queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
    }

    if (organization) {
        return <>{children}</>
    }

    return (
        <SelectOrganizationForm
            organizations={organizations}
            onSelect={select}
            onCreated={created => {
                queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_QUERY_KEY })
                select(created)
            }}
        />
    )
}

const SelectOrganizationWrapper: React.FC<React.PropsWithChildren> = props => {
    const organizationApi = useOrganizationApi()
    const organizationStore = useOrganizationStore()

    const organizationsQuery = useQuery({
        queryKey: ORGANIZATIONS_QUERY_KEY,
        queryFn: async () => {
            const organizations = await organizationApi.getMineOrganizations()
            organizationStore.setOrganizations(organizations)

            // Re-read on every run, so a refetch after accepting an invitation lands on the
            // organization that was just joined rather than on the one selected before it.
            const storedId = getOrganizationIdFromLocalStorage()
            const stored = storedId ? organizations.find(candidate => candidate._id === storedId) : undefined
            const selected = stored ?? (organizations.length === 1 ? organizations[0] : undefined)

            if (selected) {
                organizationStore.setOrganization(selected)
                setOrganizationIdInLocalStorage(selected._id)
            }

            return organizations
        }
    })

    return (
        <ApiStatusHandler queries={[organizationsQuery]}>
            <SelectOrganizationWrapperInner {...props} />
        </ApiStatusHandler>
    )
}

export default SelectOrganizationWrapper
