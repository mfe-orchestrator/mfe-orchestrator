import { Alert, AlertDescription, AlertTitle } from "@mfe-orchestrator/design-system"
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"

/** Cosa risponde l'API a una prova di connessione: se ha funzionato, e cosa ha detto l'altra parte quando no */
export interface ConnectionTestResult {
    ok: boolean
    message?: string
}

interface ConnectionTestProps {
    /** Esegue la prova; undefined quando il form non la lascia partire (manca un campo obbligatorio) */
    onTest: () => Promise<ConnectionTestResult | undefined>
    /** Cosa vuol dire la riuscita, per chi la legge */
    successDescription?: string
    dataTestId: string
}

/** Il pulsante "Prova connessione" di un form, con l'esito sotto fino al tentativo successivo */
const ConnectionTest: React.FC<ConnectionTestProps> = ({ onTest, successDescription, dataTestId }) => {
    const { t } = useTranslation()
    const [isTesting, setIsTesting] = useState(false)
    const [result, setResult] = useState<ConnectionTestResult>()

    const run = async () => {
        setIsTesting(true)
        setResult(undefined)
        try {
            setResult(await onTest())
        } catch {
            // Il client delle API ha gia' mostrato perche' la prova non e' partita
        } finally {
            setIsTesting(false)
        }
    }

    const description = result?.ok ? successDescription : result?.message

    return (
        <div className="space-y-3">
            <Button type="button" variant="secondary" onClick={run} disabled={isTesting} dataTestId={dataTestId}>
                {isTesting ? <Loader2 className="animate-spin" /> : <PlugZap />}
                {isTesting ? t("connectionTest.testing") : t("connectionTest.test")}
            </Button>
            {result && (
                <Alert variant={result.ok ? "default" : "destructive"} dataTestId={`${dataTestId}-result`}>
                    {result.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    <AlertTitle>{result.ok ? t("connectionTest.success") : t("connectionTest.failure")}</AlertTitle>
                    {description && <AlertDescription className={result.ok ? undefined : "font-mono break-words"}>{description}</AlertDescription>}
                </Alert>
            )}
        </div>
    )
}

export default ConnectionTest
