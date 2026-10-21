import { Sparkles, Workflow } from "lucide-react"
import { useTranslation } from "react-i18next"
import WorkspaceHeader from "@/components/ai-workspace/WorkspaceHeader"
import type { Domain } from "@/hooks/apiClients/useDomainsApi"
import DomainDeployButton from "./DomainDeployDialog"

interface DomainHeaderProps {
    domain: Domain
    /** The two screens of a domain: Edit with AI and its structure. */
    active: "ai" | "structure"
    actions?: React.ReactNode
}

/** Shared by the two screens of a domain, in the same frame as those of a microfrontend and of a service, with the deploy of the domain on both. */
export const DomainHeader: React.FC<DomainHeaderProps> = ({ domain, active, actions }) => {
    const { t } = useTranslation()

    return (
        <WorkspaceHeader
            back={{ to: "/domains", label: t("domains.detail.back") }}
            title={domain.name}
            pageTitle={t(active === "ai" ? "domains.ai.open" : "domains.workspace.nav_structure")}
            meta={
                <>
                    <span className="font-mono">{domain.slug}</span>
                    {domain.description && <span>{domain.description}</span>}
                </>
            }
            navLabel={t("domains.workspace.nav_label")}
            // Edit with AI is always there: without an AI provider the workspace says so.
            tabs={[
                { to: `/domain/${domain._id}`, label: t("domains.ai.open"), icon: Sparkles, end: true },
                { to: `/domain/${domain._id}/structure`, label: t("domains.workspace.nav_structure"), icon: Workflow }
            ]}
            actions={
                <>
                    {actions}
                    <DomainDeployButton domain={domain} />
                </>
            }
        />
    )
}

export default DomainHeader
