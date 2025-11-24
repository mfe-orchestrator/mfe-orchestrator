import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Plus } from "lucide-react"
import { useTranslation } from "react-i18next"


interface BlankTemplateCardProps {
    onClick: () => void
}

export const BlankTemplateCard: React.FC<BlankTemplateCardProps> = ({ onClick }) => {
    const { t } = useTranslation()

    return (
        <Card className="cursor-pointer hover:shadow-lg transition-all duration-200 border-2 hover:border-primary hover:scale-[1.01]" onClick={onClick}>
            <CardHeader>
                <div className="flex items-start gap-3">
                    <div>
                        <div className="w-8 h-8 rounded-sm bg-primary/15 flex items-center justify-center mt-1">
                            <Plus className="w-6 h-6 text-primary/75" />
                        </div>
                    </div>
                    <div className="flex-1">
                        <CardTitle className="text-lg/6 mb-1">{t("market.blank.title")}</CardTitle>
                        <div className="text-sm text-foreground-secondary">{t("market.blank.framework")}</div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-3">
                <CardDescription>{t("market.blank.description")}</CardDescription>
            </CardContent>
        </Card>
    )
}

export default BlankTemplateCard
