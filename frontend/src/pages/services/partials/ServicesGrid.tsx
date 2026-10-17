import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { Cog } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import type { Service } from "@/hooks/apiClients/useServicesApi"
import RepositoryLink from "./RepositoryLink"
import RuntimeBadge from "./RuntimeBadge"

export const ServicesGrid: React.FC<{ services: Service[] }> = ({ services }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
            {services.map(service => (
                <Card key={service._id} className="flex h-full flex-col transition-colors duration-200 hover:border-primary">
                    <CardHeader className="flex-row items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <CardTitle className="mb-0 truncate" title={service.name}>
                                {service.name}
                            </CardTitle>
                            <p className="truncate text-sm text-foreground-secondary" title={service.slug}>
                                {service.slug}
                            </p>
                        </div>
                        {service.version && <Badge className="shrink-0">{service.version}</Badge>}
                    </CardHeader>
                    <CardContent className="flex flex-grow flex-col items-start gap-3 py-3 text-sm">
                        <RuntimeBadge service={service} />
                        <RepositoryLink service={service} />
                    </CardContent>
                    <CardFooter className="border-t border-divider pt-3">
                        <Button variant="primary" size="sm" className="flex-1" onClick={() => navigate(`/service/${service._id}`)}>
                            <Cog />
                            {t("services.list.open")}
                        </Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    )
}

export default ServicesGrid
