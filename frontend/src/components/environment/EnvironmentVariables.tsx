import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, Variable } from "lucide-react"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { EnvironmentDTO } from "@/hooks/apiClients/useEnvironmentsApi"

export interface EnvironmentVariablesProps {
    environment: EnvironmentDTO
}

// This would typically come from an API in a real application
const mockEnvironmentVariables: Record<string, Record<string, string>> = {
    DEV: {
        API_URL: "https://dev-api.example.com",
        LOG_LEVEL: "debug",
        FEATURE_FLAGS: "user_management,new_dashboard",
        ANALYTICS_ENDPOINT: "https://dev-analytics.example.com",
        DEBUG_MODE: "true"
    },
    UAT: {
        API_URL: "https://uat-api.example.com",
        LOG_LEVEL: "info",
        FEATURE_FLAGS: "user_management",
        ANALYTICS_ENDPOINT: "https://uat-analytics.example.com"
    },
    PREPROD: {
        API_URL: "https://preprod-api.example.com",
        LOG_LEVEL: "warn",
        ANALYTICS_ENDPOINT: "https://preprod-analytics.example.com"
    },
    PROD: {
        API_URL: "https://api.example.com",
        LOG_LEVEL: "error",
        ANALYTICS_ENDPOINT: "https://analytics.example.com"
    }
}

const EnvironmentVariables: React.FC<EnvironmentVariablesProps> = ({ environment }) => {
    const [isDialogOpen, setIsDialogOpen] = useState(false)
    const [environmentVars, setEnvironmentVars] = useState<Record<string, string>>(mockEnvironmentVariables[environment] || {})
    const [newEnvKey, setNewEnvKey] = useState<string>("")
    const [newEnvValue, setNewEnvValue] = useState<string>("")
    const notifications = useToastNotificationStore()

    const handleEnvVarChange = (key: string, value: string) => {
        setEnvironmentVars(prev => ({
            ...prev,
            [key]: value
        }))
    }

    const addEnvironmentVariable = () => {
        if (newEnvKey.trim() === "") return

        setEnvironmentVars(prev => ({
            ...prev,
            [newEnvKey]: newEnvValue
        }))

        setNewEnvKey("")
        setNewEnvValue("")
    }

    const removeEnvironmentVariable = (key: string) => {
        setEnvironmentVars(prev => {
            const updated = { ...prev }
            delete updated[key]
            return updated
        })
    }

    const saveConfiguration = () => {
        // Here you would typically save the environment variables to your backend
        notifications.showSuccessNotification({
            message: `Le variabili d'ambiente globali per ${environment} sono state aggiornate.`
        })
        setIsDialogOpen(false)

        // Update the mock data (in a real app this would be an API call)
        mockEnvironmentVariables[environment] = { ...environmentVars }
    }

    return (
        <>
            <Button variant="secondary" className="flex gap-2 items-center" onClick={() => setIsDialogOpen(true)}>
                <Variable className="h-4 w-4" />
                <span>Variabili d'ambiente</span>
            </Button>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Variabili d'ambiente globali: {environment}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <p className="text-sm text-muted-foreground mb-4">
                                Gestisci le variabili d'ambiente globali per l'ambiente {environment}. Queste variabili saranno disponibili per tutti i microfrontend.
                            </p>

                            {Object.keys(environmentVars).length > 0 ? (
                                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                                    {Object.entries(environmentVars).map(([key, value]) => (
                                        <div key={key} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                                            <div className="flex-1">
                                                <div className="font-semibold text-sm">{key}</div>
                                                <Input value={value} onChange={e => handleEnvVarChange(key, e.target.value)} className="mt-1" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button variant="ghost" size="sm" onClick={() => removeEnvironmentVariable(key)} title="Rimuovi variabile">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center p-4 text-muted-foreground border rounded-md mb-4">Nessuna variabile d'ambiente configurata</div>
                            )}

                            <div className="flex flex-col space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-1">
                                        <Label htmlFor="env-key">Chiave</Label>
                                        <Input id="env-key" placeholder="API_URL" value={newEnvKey} onChange={e => setNewEnvKey(e.target.value)} />
                                    </div>
                                    <div className="col-span-2">
                                        <Label htmlFor="env-value">Valore</Label>
                                        <div className="flex gap-2">
                                            <Input id="env-value" placeholder="https://api.example.com" value={newEnvValue} onChange={e => setNewEnvValue(e.target.value)} className="flex-1" />
                                            <Button variant="secondary" size="icon" onClick={addEnvironmentVariable} disabled={newEnvKey.trim() === ""} title="Aggiungi variabile">
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end mt-4">
                        <Button type="button" onClick={saveConfiguration}>
                            Salva configurazione
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}

export default EnvironmentVariables
