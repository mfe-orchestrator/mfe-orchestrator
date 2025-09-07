import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button/button';
import { useTranslation } from 'react-i18next';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface StatCardProps {
  icon: ReactNode;
  title: string;
  value: number | string;
  buttonText?: string;
  onAction?: () => void;
  href?: string;
}

const StatCard = ({ icon, title, value, buttonText, onAction, href }: StatCardProps) => {
    const { t } = useTranslation()
    const buttonTestReal = buttonText || t("settings.stats.viewAll")
    return (
        <div className="p-3 bg-muted rounded-md border-2 border-border">
            <div className="flex items-end justify-between gap-2 h-full">
                <div className="flex items-start gap-2">
                    <div className="text-muted-foreground [&>svg]:w-5 [&>svg]:h-5">{icon}</div>
                    <div>
                        <h3 className="text-base text-muted-foreground leading-tight">{title}</h3>
                        <p className="text-lg font-bold text-foreground">{value}</p>
                    </div>
                </div>
                <Button variant="ghost" size="sm" onClick={onAction} asChild={!!href}>
                    {href ? <Link to={href}>{buttonTestReal}</Link> : buttonTestReal}
                </Button>
            </div>
        </div>
    )
}

interface ProjectStatsSectionProps {
    stats: StatCardProps[]
}

export function ProjectStatsSection({ stats }: ProjectStatsSectionProps) {
    const { t } = useTranslation()

    return (
        <Card>
            <CardHeader>
                <h2 className="text-lg font-semibold">{t("settings.stats.title")}</h2>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
                    {stats.map((stat, index) => (
                        <StatCard key={index} icon={stat.icon} title={stat.title} value={stat.value} buttonText={stat.buttonText} onAction={stat.onAction} href={stat.href} />
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
