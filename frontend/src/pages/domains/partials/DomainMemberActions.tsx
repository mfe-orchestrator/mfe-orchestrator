import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@mfe-orchestrator/design-system"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, CirclePlus, DownloadCloud, Link2, Plus } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import useCodeRepositoriesApi from "@/hooks/apiClients/useCodeRepositoriesApi"
import { ImportRepositoriesDialog } from "@/pages/microfrontends/partials/components"
import useProjectStore from "@/store/useProjectStore"
import AssignDomainMembersDialog, { DomainMemberCandidate, DomainMemberKind } from "./AssignDomainMembersDialog"

interface DomainMemberActionsProps {
    kind: DomainMemberKind
    domainId: string
    label: string
    onCreate: () => void
    /** The microfrontends or services of the project that are not in the domain */
    candidates: DomainMemberCandidate[]
}

/** The add menu of the frontend or the backend of a domain: create a new member, add existing ones, or import them from repositories. */
const DomainMemberActions: React.FC<DomainMemberActionsProps> = ({ kind, domainId, label, onCreate, candidates }) => {
    const { t } = useTranslation()
    const codeRepositoriesApi = useCodeRepositoriesApi()
    const projectId = useProjectStore(state => state.project?._id)
    const [isAssignOpen, setIsAssignOpen] = useState(false)
    const [isImportOpen, setIsImportOpen] = useState(false)

    const codeRepositoriesQuery = useQuery({
        queryKey: ["repositories", projectId],
        queryFn: () => codeRepositoriesApi.getRepositoriesByProjectId(projectId!),
        enabled: !!projectId
    })
    const codeRepositories = codeRepositoriesQuery.data ?? []

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm" className="shrink-0">
                        <CirclePlus />
                        {label}
                        <ChevronDown />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onCreate} className="cursor-pointer">
                        <Plus className="mr-2 h-4 w-4" />
                        <span>{t(`domains.members.create_${kind}`)}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsAssignOpen(true)} className="cursor-pointer">
                        <Link2 className="mr-2 h-4 w-4" />
                        <span>{t("domains.members.assign_existing")}</span>
                    </DropdownMenuItem>
                    {/* Importing only makes sense once the project has a provider connection */}
                    {codeRepositories.length > 0 && (
                        <DropdownMenuItem onClick={() => setIsImportOpen(true)} className="cursor-pointer">
                            <DownloadCloud className="mr-2 h-4 w-4" />
                            <span>{t("domains.members.import_repository")}</span>
                        </DropdownMenuItem>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            <AssignDomainMembersDialog open={isAssignOpen} onOpenChange={setIsAssignOpen} kind={kind} domainId={domainId} candidates={candidates} />
            {codeRepositories.length > 0 && <ImportRepositoriesDialog open={isImportOpen} onOpenChange={setIsImportOpen} codeRepositories={codeRepositories} target={kind} domainId={domainId} />}
        </>
    )
}

export default DomainMemberActions
