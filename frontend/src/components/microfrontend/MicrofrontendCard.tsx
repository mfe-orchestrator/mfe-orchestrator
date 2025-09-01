import { Badge } from "@/components/ui/badge/badge"
import { Button } from "@/components/ui/button/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { Percent } from "lucide-react"
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
        <Card className="h-full flex flex-col hover:shadow-md transition-shadow">
            <CardHeader>
                <div className="flex items-start justify-between">
                    <CardTitle className="text-lg font-medium">{mfe.name}</CardTitle>
                    <Badge>{mfe.slug}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                        <span>Versione {version}</span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-grow">
                <p className="text-sm">{mfe.description}</p>
                {canaryPercentage > 0 && (
                    <div className="mt-3 p-2 bg-orange-100 rounded-md text-sm">
                        <div className="font-semibold flex items-center text-orange-700">
                            <Percent className="mr-1 h-4 w-4" /> Canary Release
                        </div>
                        <div className="text-orange-600">Attiva per il {canaryPercentage}% degli utenti</div>
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex justify-between items-center border-t pt-4">
                <Button size="sm" variant="secondary" onClick={() => navigate(`/microfronted/${mfe._id}`)}>
                    Configurazione
                </Button>
            </CardFooter>
        </Card>
    )
}

export default MicrofrontendCard
