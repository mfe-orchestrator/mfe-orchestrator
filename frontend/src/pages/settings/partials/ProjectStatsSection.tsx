import { Card, CardContent, CardHeader, CardTitle, StatTile } from "@mfe-orchestrator/design-system"
import { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Button } from "@/components/atoms"

interface ProjectStat {
    icon: ReactNode
    title: string
    value: number | string
    buttonText?: string
    onAction?: () => void
    href?: string
}

interface ProjectStatsSectionProps {
    stats: ProjectStat[]
}

export function ProjectStatsSection({ stats }: ProjectStatsSectionProps) {
    const { t } = useTranslation()

    return (
        <Card>
            <CardHeader className="border-none">
                <CardTitle as="h2">{t("settings.stats.title")}</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap items-center gap-4">
                    {stats.map((stat, index) => (
                        <StatTile
                            key={index}
                            size="lg"
                            labelAs="h3"
                            className="flex-[1_0_180px] lg:flex-[1_0_280px]"
                            icon={stat.icon}
                            label={stat.title}
                            value={stat.value}
                            action={
                                <Button variant="link" onClick={stat.onAction} asChild={!!stat.href} className="-me-2 -mb-1 min-w-[unset]">
                                    {stat.href ? <Link to={stat.href}>{stat.buttonText || t("settings.stats.viewAll")}</Link> : stat.buttonText || t("settings.stats.viewAll")}
                                </Button>
                            }
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}

export default ProjectStatsSection
