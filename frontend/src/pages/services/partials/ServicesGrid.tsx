import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { Cog, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import useAssistantEnabled from "@/components/assistant/useAssistantEnabled"
import { Badge, Button } from "@/components/atoms"
import RepositoryLink from "@/components/RepositoryLink"
import type { Service } from "@/hooks/apiClients/useServicesApi"
import RuntimeBadge from "./RuntimeBadge"
import { isServiceAiAvailable } from "./ServiceHeader"

export const ServicesGrid: React.FC<{ services: Service[] }> = ({ services }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const assistantEnabled = useAssistantEnabled()

    return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
            {services.map(service => {
                // Opens on Edit with AI, as a microfrontend does, when the agent can work on the service.
                const aiAvailable = isServiceAiAvailable(service, assistantEnabled)
                return (
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
                            <RepositoryLink repository={service.codeRepository} />
                        </CardContent>
                        <CardFooter className="border-t border-divider pt-3">
                            <Button variant="primary" size="sm" className="flex-1" onClick={() => navigate(aiAvailable ? `/service/${service._id}` : `/service/${service._id}/overview`)}>
                                {aiAvailable ? <Sparkles /> : <Cog />}
                                {aiAvailable ? t("services.nav_ai") : t("services.list.open")}
                            </Button>
                        </CardFooter>
                    </Card>
                )
            })}
        </div>
    )
}

export default ServicesGrid
