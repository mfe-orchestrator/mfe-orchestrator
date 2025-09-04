import { Badge } from "@/components/ui/badge/badge"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { UsersRound } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

interface MicrofrontendCardProps {
    mfe: Microfrontend
}

const MicrofrontendCard: React.FC<MicrofrontendCardProps> = ({ mfe }) => {
    const navigate = useNavigate()

    const isCanary = mfe?.canary?.enabled

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex-row items-end justify-between flex-wrap-reverse">
                <div>
                    <CardTitle className="mb-0">{mfe.name}</CardTitle>
                    <div className="text-sm text-foreground-secondary">{mfe.slug}</div>
                </div>
                <Badge>{mfe.version}</Badge>
            </CardHeader>
            <CardContent className="flex-grow py-3 flex flex-col gap-2">
                <div className="text-foreground-secondary mt-2 flex flex-row">
                    <div className="font-medium mr-2">Host: </div>
                    <div>
                        {mfe.host.type === 'CUSTOM_URL' && 'Custom Url'}
                        {mfe.host.type === 'MFE_ORCHESTRATOR_HUB' && 'MFE Orchestrator Hub'}
                        {mfe.host.type === 'CUSTOM_SOURCE' && 'Custom Source'}
                    </div>
                </div>
                {isCanary && (
                    <div className="mt-2 p-3 bg-muted/30 rounded-md border border-muted-foreground/20">
                        <div className="flex items-center gap-2 text-primary font-semibold mb-2">
                            <UsersRound size="1.1rem" />
                            <span>Canary Release Attiva</span>
                        </div>
                        <div className="grid gap-1.5 text-sm">
                            <div className="flex justify-between">
                                <span className="text-foreground-secondary">Distribuzione:</span>
                                <span className="font-medium">{mfe.canary.percentage}% degli utenti</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-foreground-secondary">Tipo:</span>
                                <span className="font-medium">
                                    {mfe.canary.type === 'ON_SESSIONS' && 'Sessione'}
                                    {mfe.canary.type === 'ON_USER' && 'Utente'}
                                    {mfe.canary.type === 'COOKIE_BASED' && 'Basato su Cookie'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-foreground-secondary">Deployment:</span>
                                <span className="font-medium">
                                    {mfe.canary.deploymentType === 'BASED_ON_VERSION' && 'Basato su Versione'}
                                    {mfe.canary.deploymentType === 'BASED_ON_URL' && 'Basato su URL'}
                                </span>
                            </div>
                            {mfe.canary.url && (
                                <div className="flex justify-between">
                                    <span className="text-foreground-secondary">URL Canary:</span>
                                    <span className="font-medium truncate max-w-[200px]" title={mfe.canary.url}>
                                        {mfe.canary.url}
                                    </span>
                                </div>
                            )}
                            {mfe.canary.version && (
                                <div className="flex justify-between">
                                    <span className="text-foreground-secondary">Versione Canary:</span>
                                    <span className="font-medium">{mfe.canary.version}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                <Button variant="primary" onClick={() => navigate(`/microfronted/${mfe._id}`)} className="w-full">
                    Configurazione
                </Button>
            </CardFooter>
        </Card>
    )
}

export default MicrofrontendCard
