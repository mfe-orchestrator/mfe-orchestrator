import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertCircle, Trash2 } from "lucide-react"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { useMutation } from "@tanstack/react-query"
import { Button } from "../../../../components/ui/button/button"
import { Input } from "../../../../components/ui/input/input"
import { Label } from "../../../../components/ui/label"
import useToastNotificationStore from "@/store/useToastNotificationStore";

// Simple class name concatenation helper
const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(" ")

interface IDangerZoneRemoveMicrofrontendProps {
    microfrontend?: Microfrontend
}

export const DangerZoneRemoveMicrofrontend: React.FC<IDangerZoneRemoveMicrofrontendProps> = ({ microfrontend }) => {
    const [opened, setOpened] = useState(false)
    const [confirmationText, setConfirmationText] = useState("")
    const { deleteSingle } = useMicrofrontendsApi()
    const notificationToast = useToastNotificationStore()
    const navigate = useNavigate()
    const { t } = useTranslation()

    const deleteMicrofrontendMutation = useMutation({
        mutationFn: () => deleteSingle(microfrontend!._id),
        onSuccess: () => {
            notificationToast.showSuccessNotification({
                message: t("microfrontend.dangerZone.delete.success")
            })
            navigate('/microfrontends')
        }
    })

    const handleDeleteMicrofrontend = async () => {
        if (!microfrontend || confirmationText !== microfrontend.name) return

        await deleteMicrofrontendMutation.mutateAsync()
        setOpened(false)
    }

    // Don't render if there's no microfrontend (creating new one)
    if (!microfrontend) {
        return null
    }

    return (
        <Card className="border-destructive">
            <CardHeader>
                <h2 className="text-xl font-semibold text-destructive">{t("microfrontend.dangerZone.title")}</h2>
                <CardDescription className="text-destructive-active">{t("microfrontend.dangerZone.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-y-2 gap-x-4 flex-wrap">
                    <div>
                        <h3 className="text-lg font-medium m-0">{t("microfrontend.dangerZone.delete.title")}</h3>
                        <p className="text-foreground-secondary m-0">{t("microfrontend.dangerZone.delete.description")}</p>
                    </div>
                    <Button variant="destructive" onClick={() => setOpened(true)} type='button'>
                        <Trash2 />
                        {t("microfrontend.dangerZone.delete.button")}
                    </Button>
                </div>
            </CardContent>

            <Dialog open={opened} onOpenChange={setOpened}>
                <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
                    <DialogHeader className="mb-4">
                        <DialogTitle>{t("microfrontend.dangerZone.delete.dialog.title")}</DialogTitle>
                    </DialogHeader>

                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>{t("microfrontend.dangerZone.delete.dialog.warning")}</AlertTitle>
                        <AlertDescription className="mt-2">
                            {t("microfrontend.dangerZone.delete.dialog.description", { microfrontendName: microfrontend.name })}
                            <div className="mt-2">{t("microfrontend.dangerZone.delete.dialog.confirmation", { microfrontendName: microfrontend.name })}</div>
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2 py-4">
                        <Label className="text-foreground-secondary">{t("microfrontend.dangerZone.delete.dialog.confirmationText", { microfrontendName: microfrontend.name })}</Label>
                        <Input placeholder={microfrontend.name} value={confirmationText} onChange={e => setConfirmationText(e.target.value)} className="w-full" />
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setOpened(false)}>
                            {t("common.cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            type='button'
                            onClick={handleDeleteMicrofrontend}
                            disabled={confirmationText !== microfrontend.name || deleteMicrofrontendMutation.isPending}
                            className={cn(deleteMicrofrontendMutation.isPending && "opacity-50 cursor-not-allowed")}
                        >
                            {deleteMicrofrontendMutation.isPending ? t("microfrontend.dangerZone.delete.dialog.deleting") : t("microfrontend.dangerZone.delete.dialog.confirmButton")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}

export default DangerZoneRemoveMicrofrontend
