import { EmptyState } from "@mfe-orchestrator/design-system"
import { KeyRound, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"

interface NoApiKeyPlaceholderProps {
    onCreate?: () => void
}

export const NoApiKeyPlaceholder: React.FC<NoApiKeyPlaceholderProps> = ({ onCreate }) => {
    const { t } = useTranslation()

    return (
        <EmptyState
            size="lg"
            tone="accent"
            titleAs="h3"
            icon={<KeyRound />}
            title={t("apiKeys.no_api_keys")}
            description={t("apiKeys.no_api_keys_desc", {
                defaultValue: "API keys let external services authenticate with your project. Create one to get started."
            })}
            actions={
                onCreate && (
                    <Button onClick={onCreate} dataTestId="api-key-create">
                        <Plus className="mr-2 h-4 w-4" />
                        {t("apiKeys.create_api_key")}
                    </Button>
                )
            }
        />
    )
}

export default NoApiKeyPlaceholder
