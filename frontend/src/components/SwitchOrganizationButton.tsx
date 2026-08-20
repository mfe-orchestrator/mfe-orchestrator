import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@mfe-orchestrator/design-system"
import { useQueryClient } from "@tanstack/react-query"
import { Building2, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import CreateOrganizationForm from "@/components/CreateOrganizationForm"
import OrganizationPickerList from "@/components/OrganizationPickerList"
import PendingInvitationsList from "@/components/PendingInvitationsList"
import useOrganizationApi, { ORGANIZATIONS_QUERY_KEY, Organization } from "@/hooks/apiClients/useOrganizationApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import useProjectStore from "@/store/useProjectStore"
import { clearProjectIdInLocalStorage, setOrganizationIdInLocalStorage } from "@/utils/localStorageUtils"

const SwitchOrganizationButton = () => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const { organization, organizations = [], setOrganization, setOrganizations } = useOrganizationStore()
    const { setProject } = useProjectStore()
    const organizationApi = useOrganizationApi()
    const queryClient = useQueryClient()

    const loadOrganizations = async () => {
        try {
            setOrganizations(await organizationApi.getMineOrganizations())
        } catch (error) {
            console.error("Failed to load organizations:", error)
        }
    }

    const handleSelect = (selected: Organization) => {
        setOrganization(selected)
        setOrganizationIdInLocalStorage(selected._id)
        // Switching tenant invalidates the project in use: it belongs to the one being left behind.
        clearProjectIdInLocalStorage()
        setProject(undefined)
        queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
        setIsOpen(false)
        setIsCreating(false)
    }

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open)
        setIsCreating(false)
        if (open) {
            loadOrganizations()
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="secondary" size="sm" dataTestId="switch-organization">
                    <Building2 />
                    <span className="max-w-[160px] truncate">{organization?.name ?? t("organization.switch_or_create")}</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>{t("organization.switch_or_create")}</DialogTitle>
                    <DialogDescription>{t("organization.switch_desc")}</DialogDescription>
                </DialogHeader>
                <div className="pt-2">
                    {/* Accepting turns the invitation into an organization, so the list underneath has to be reloaded. */}
                    <PendingInvitationsList kind="organization" className="mb-4" onAccepted={loadOrganizations} />
                    {isCreating ? (
                        <CreateOrganizationForm
                            onCreated={created => {
                                queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_QUERY_KEY })
                                handleSelect(created)
                            }}
                            onCancel={() => setIsCreating(false)}
                        />
                    ) : (
                        <>
                            <OrganizationPickerList organizations={organizations} activeOrganizationId={organization?._id} onSelect={handleSelect} autoFocusSearch className="mb-4" />
                            <div className="border-t border-divider pt-4">
                                <Button variant="primary" size="sm" className="w-full" onClick={() => setIsCreating(true)}>
                                    <Plus />
                                    <span>{t("organization.create_new")}</span>
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default SwitchOrganizationButton
