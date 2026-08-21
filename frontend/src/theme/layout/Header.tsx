import { ChevronRight } from "lucide-react"
import { Link } from "react-router-dom"
import SwitchOrganizationButton from "@/components/SwitchOrganizationButton"
import SwitchProjectButton from "@/components/SwitchProjectButton"
import useOrganizationStore from "@/store/useOrganizationStore"
import useProjectStore from "@/store/useProjectStore"

const Header: React.FC = () => {
    const { project } = useProjectStore()
    const { organization } = useOrganizationStore()

    return (
        <header className="bg-background border-b border-divider flex items-center justify-between gap-2 px-1 mx-2 pt-2 pb-4">
            {/* Organization first, then project: the project name alone does not say which tenant it is in. */}
            <h1 className="flex min-w-0 items-center gap-1 text-lg font-semibold text-foreground-secondary">
                {organization && (
                    <>
                        {/* Cliccabile: e' la strada breve verso l'organizzazione, che dalla sidebar non passa piu. */}
                        <Link to="/organization" className="hidden truncate text-base font-normal hover:text-foreground hover:underline sm:inline" data-testid="header-organization-link">
                            {organization.name}
                        </Link>
                        <ChevronRight className="hidden size-4 shrink-0 sm:inline" aria-hidden="true" />
                    </>
                )}
                <span className="truncate">{project?.name}</span>
            </h1>
            <div className="flex shrink-0 items-center gap-2">
                <SwitchOrganizationButton />
                <SwitchProjectButton />
            </div>
        </header>
    )
}

export default Header
