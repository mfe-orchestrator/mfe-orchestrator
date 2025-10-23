import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge/badge';
import { Plus } from "lucide-react"

interface BlankMarketCardProps {
    onClick: () => void
}

const BlankMarketCard: React.FC<BlankMarketCardProps> = ({ onClick }) => {
    const { t } = useTranslation()

    return (
        <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 border-2 hover:border-primary" onClick={onClick}>
            <CardHeader>
                <div className="flex items-start gap-3">
                    <div>
                        <div className="w-8 h-8 rounded-sm bg-primary/25 flex items-center justify-center mt-1">
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

export default BlankMarketCard;