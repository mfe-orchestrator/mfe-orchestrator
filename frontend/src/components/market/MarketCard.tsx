import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge/badge';
import { Market } from '../../hooks/apiClients/useMarketApi';
import { Button } from "../ui/button/button"
import { Alert } from "../ui/alert"

interface MarketCardProps {
    market: Market
    onClick?: (slug: string) => void
}

const MarketCard: React.FC<MarketCardProps> = ({ market, onClick }) => {
    const { t } = useTranslation()

    const handleCardClick = (e: React.MouseEvent) => {
        if (market.comingSoon || !onClick) {
            e.preventDefault()
            return
        }
        onClick(market.slug)
    }

    const handleRepoclick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (market.repo) {
            window.open(market.repo, "_blank")
        }
    }

    return (
        <Card
            className={`transition-shadow duration-200 relative ${market.comingSoon ? "cursor-not-allowed border-border/50" : onClick ? "cursor-pointer hover:shadow-lg hover:border-primary" : ""}`}
            onClick={handleCardClick}
        >
            {market.comingSoon && (
                <div className="absolute top-1/2 start-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                    <Alert className="text-center font-semibold tracking-normal py-2 px-4 uppercase bg-accent text-accent-foreground w-auto rounded-sm -rotate-6">{t("market.card.comingSoon")}</Alert>
                </div>
            )}

            <CardHeader className={`${market.comingSoon && "opacity-50"}`}>
                <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                        <img src={market.icon} alt={market.name} className="w-8 h-8" />
                    </div>
                    <div className="flex-1">
                        <CardTitle className="text-lg/6 mb-1">{market.name}</CardTitle>
                        <div className="text-sm text-foreground-secondary">{market.framework}</div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className={`pt-3 ${market.comingSoon && "opacity-50"}`}>
                <CardDescription>{market.description}</CardDescription>

                {market.repo && !market.comingSoon && (
                    <Button variant="link" className="px-0 mt-3" onClick={handleRepoclick}>
                        <svg fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        {t("market.card.viewOnGitHub")}
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}

export default MarketCard;