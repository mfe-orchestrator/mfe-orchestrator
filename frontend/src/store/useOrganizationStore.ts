import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { Organization } from "@/hooks/apiClients/useOrganizationApi"

interface OrganizationState {
    /** The organization currently being worked in: every project screen below it is scoped to this one. */
    organization?: Organization
    organizations?: Organization[]
    setOrganization: (organization?: Organization) => void
    setOrganizations: (organizations: Organization[]) => void
}

const useOrganizationStore = create<OrganizationState>()(
    devtools(
        set => ({
            setOrganization: (organization?: Organization) => {
                set({ organization })
            },
            setOrganizations: (organizations: Organization[]) => {
                set({ organizations })
            }
        }),
        {
            name: "organization-storage"
        }
    )
)

export default useOrganizationStore
