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
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const navigate = useNavigate()

    // Get environment-specific data or fall back to default
    const version = mfe.version

    const [editParameters, setEditParameters] = useState<Record<string, string>>(null)
    const [editCanaryPercentage, setEditCanaryPercentage] = useState<number>(null)
    const notifications = useToastNotificationStore()

    const statusColor = {
        active: "bg-green-500",
        inactive: "bg-yellow-500",
        error: "bg-red-500"
    }

    const handleParameterChange = (key: string, value: string) => {
        setEditParameters(prev => ({
            ...prev,
            [key]: value
        }))
    }

    const addParameter = () => {
        setEditParameters(prev => ({
            ...prev,
            [`param${Object.keys(editParameters).length + 1}`]: ""
        }))
    }

    const saveConfiguration = () => {
        // Here you would typically save the parameters to your backend
        notifications.showSuccessNotification({
            message: `I parametri per ${mfe.name} sono stati aggiornati.`
        })
        setIsDialogOpen(false)
    }

    const canaryPercentage = 38

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="flex-row items-end justify-between flex-wrap-reverse">
                <div>
                    <CardTitle>{mfe.name}</CardTitle>
                    <div className="text-sm text-foreground-secondary">{mfe.slug}</div>
                </div>
                <Badge>{mfe.version}</Badge>
            </CardHeader>
            <CardContent className="flex-grow py-3 flex flex-col gap-2">
                {mfe.description && <p className="text-foreground-secondary">{mfe.description}</p>}
                {canaryPercentage > 0 && (
                    <div className="flex items-start gap-2 leading-snug">
                        <UsersRound size="1.25rem" className="mt-0.5" />
                        <div>
                            <div className="font-semibold">Canary Release:</div>
                            <div>Attiva per il {canaryPercentage}% degli utenti</div>
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
