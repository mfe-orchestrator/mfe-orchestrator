import { KeyRound, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"

interface NoApiKeyPlaceholderProps {
    onCreate?: () => void
}

export const NoApiKeyPlaceholder: React.FC<NoApiKeyPlaceholderProps> = ({ onCreate }) => {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col items-center justify-center gap-4 px-6 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
                <KeyRound className="h-7 w-7" />
            </div>
            <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{t("apiKeys.no_api_keys")}</h3>
                <p className="mx-auto max-w-sm text-sm text-muted-foreground">
                    {t("apiKeys.no_api_keys_desc", {
                        defaultValue: "API keys let external services authenticate with your project. Create one to get started."
                    })}
                </p>
            </div>
            {onCreate && (
                <Button onClick={onCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t("apiKeys.create_api_key")}
                </Button>
            )}
        </div>
    )
}

export default NoApiKeyPlaceholder
