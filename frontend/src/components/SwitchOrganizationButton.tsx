import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@mfe-orchestrator/design-system"
import { useQueryClient } from "@tanstack/react-query"
import { Building2, ChevronDown, Plus, Repeat, Settings } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/atoms"
import CreateOrganizationForm from "@/components/CreateOrganizationForm"
import OrganizationPickerList from "@/components/OrganizationPickerList"
import PendingInvitationsList from "@/components/PendingInvitationsList"
import useOrganizationApi, { ORGANIZATIONS_QUERY_KEY, Organization } from "@/hooks/apiClients/useOrganizationApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import useProjectStore from "@/store/useProjectStore"
import { clearProjectIdInLocalStorage, setOrganizationIdInLocalStorage } from "@/utils/localStorageUtils"

/**
 * Tutto quello che riguarda l'organizzazione, raccolto qui.
 *
 * È l'unica porta d'accesso al livello organizzazione: la sidebar è interamente di progetto, quindi
 * impostazioni, cambio e creazione partono da questo menu invece di stare in mezzo alle voci di
 * navigazione del progetto.
 */
const SwitchOrganizationButton = () => {
    const { t } = useTranslation()
    const [isPickerOpen, setIsPickerOpen] = useState(false)
    const [isCreating, setIsCreating] = useState(false)
    const { organization, organizations = [], setOrganization, setOrganizations } = useOrganizationStore()
    const { setProject } = useProjectStore()
    const organizationApi = useOrganizationApi()
    const queryClient = useQueryClient()
    const navigate = useNavigate()

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
        setIsPickerOpen(false)
        setIsCreating(false)
    }

    const openPicker = () => {
        setIsCreating(false)
        setIsPickerOpen(true)
        loadOrganizations()
    }

    // Salta la lista e apre direttamente il form: chi ha scelto "crea" non sta cercando fra le sue.
    const openCreate = () => {
        setIsCreating(true)
        setIsPickerOpen(true)
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" dataTestId="switch-organization">
                        <Building2 />
                        <span className="max-w-[160px] truncate">{organization?.name ?? t("organization.switch_or_create")}</span>
                        <ChevronDown />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-60" align="end">
                    <DropdownMenuLabel>{t("organization.menu_title")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {organization && (
                        <DropdownMenuItem onClick={() => navigate("/organization")} className="cursor-pointer" dataTestId="organization-settings-action">
                            <Settings className="mr-2 h-4 w-4" />
                            <span>{t("organization.settings")}</span>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={openPicker} className="cursor-pointer" dataTestId="organization-switch-action">
                        <Repeat className="mr-2 h-4 w-4" />
                        <span>{t("organization.switch")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={openCreate} className="cursor-pointer" dataTestId="organization-create-action">
                        <Plus className="mr-2 h-4 w-4" />
                        <span>{t("organization.create_new")}</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog
                open={isPickerOpen}
                onOpenChange={open => {
                    setIsPickerOpen(open)
                    if (!open) setIsCreating(false)
                }}
            >
                <DialogContent className="sm:max-w-[440px]">
                    <DialogHeader>
                        <DialogTitle>{isCreating ? t("organization.create_new") : t("organization.switch_or_create")}</DialogTitle>
                        <DialogDescription>{isCreating ? t("organization.create_desc") : t("organization.switch_desc")}</DialogDescription>
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
        </>
    )
}

export default SwitchOrganizationButton
