import { AddTile } from "@mfe-orchestrator/design-system"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

interface AddNewMicrofrontendCardProps {
    onAddNewMicrofrontend: () => void
    className?: string
}

export const AddNewMicrofrontendCard: React.FC<AddNewMicrofrontendCardProps> = ({ onAddNewMicrofrontend, className }) => {
    const { t } = useTranslation("platform")

    return <AddTile aspect="auto" onClick={() => onAddNewMicrofrontend()} icon={<Plus />} label={t("microfrontend.add_new")} description={t("microfrontend.click_to_create")} className={className} />
}

export default AddNewMicrofrontendCard
