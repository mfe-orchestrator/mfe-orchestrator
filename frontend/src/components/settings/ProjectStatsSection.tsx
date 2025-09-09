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
        <div className="p-3 bg-muted rounded-md border-2 border-border flex-[1_0_180px] lg:flex-[1_0_280px]">
            <div className="flex flex-col gap-2 h-full">
                <div>
                    <div className="flex items-center gap-2 border-b border-divider pb-2">
                        <div className="text-foreground [&>svg]:w-4 [&>svg]:h-4">{icon}</div>
                        <h3 className="text-base text-foreground font-medium">{title}</h3>
                    </div>
                    <p className="text-5xl text-foreground-secondary text-center mt-3">{value}</p>
                </div>
                <Button variant="link" onClick={onAction} asChild={!!href} className="self-end -me-2 -mb-1">
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
            <CardHeader className="border-none">
                <h2 className="text-lg font-semibold">{t("settings.stats.title")}</h2>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap items-center gap-4">
                    {stats.map((stat, index) => (
                        <StatCard key={index} icon={stat.icon} title={stat.title} value={stat.value} buttonText={stat.buttonText} onAction={stat.onAction} href={stat.href} />
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
