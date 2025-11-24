import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input/input";
import { Label } from "@/components/ui/label";
import useProjectApi from "@/hooks/apiClients/useProjectApi";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Trash2 } from "lucide-react";
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// Simple class name concatenation helper
const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(" ")

// Temporary type definitions for typography components
const TypographyH3 = ({ className, children }: { className?: string; children: React.ReactNode }) => <h3 className={`scroll-m-20 text-2xl font-semibold tracking-tight ${className}`}>{children}</h3>

const TypographyP = ({ className, children }: { className?: string; children: React.ReactNode }) => <p className={`leading-7 [&:not(:first-child)]:mt-6 ${className}`}>{children}</p>

const TypographySmall = ({ className, children }: { className?: string; children: React.ReactNode }) => <small className={`text-sm font-medium leading-none ${className}`}>{children}</small>

interface DangerZoneProps {
    projectName: string
    projectId: string
    onDeleteSuccess: () => Promise<void>
}

export function DangerZone({ projectName, projectId, onDeleteSuccess }: DangerZoneProps) {
    const [opened, setOpened] = useState(false)
    const [confirmationText, setConfirmationText] = useState("")
    const projectApi = useProjectApi()

    const deleteProjectMutation = useMutation({
        mutationFn: projectApi.deleteProject
    })

    const handleDeleteProject = async () => {
        if (confirmationText !== projectName) return

        await deleteProjectMutation.mutateAsync(projectId)
        await onDeleteSuccess?.()
        setOpened(false)
    }

    const { t } = useTranslation()

    return (
        <Card className="border-destructive">
            <CardHeader>
                <h2 className="text-xl font-semibold text-destructive">{t("settings.dangerZone.title")}</h2>
                <CardDescription className="text-destructive-active">{t("settings.dangerZone.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="flex items-center justify-between gap-y-2 gap-x-4 flex-wrap">
                    <div>
                        <h3 className="text-lg font-medium m-0">{t("settings.dangerZone.delete.title")}</h3>
                        <p className="text-foreground-secondary m-0">{t("settings.dangerZone.delete.description")}</p>
                    </div>
                    <Button variant="destructive" onClick={() => setOpened(true)}>
                        <Trash2 />
                        {t("settings.dangerZone.delete.button")}
                    </Button>
                </div>
            </CardContent>

            <Dialog open={opened} onOpenChange={setOpened}>
                <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
                    <DialogHeader className="mb-4">
                        <DialogTitle>{t("settings.dangerZone.delete.dialog.title")}</DialogTitle>
                    </DialogHeader>

                    <Alert variant="destructive" className="mb-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>{t("settings.dangerZone.delete.dialog.warning")}</AlertTitle>
                        <AlertDescription className="mt-2">
                            {t("settings.dangerZone.delete.dialog.description", { projectName })}
                            <div className="mt-2">{t("settings.dangerZone.delete.dialog.confirmation", { projectName: <span className="font-bold">{projectName}</span> })}</div>
                        </AlertDescription>
                    </Alert>

                    <div className="space-y-2 py-4">
                        <Label className="text-foreground-secondary">{t("settings.dangerZone.delete.dialog.confirmationText", { projectName })}</Label>
                        <Input placeholder={projectName} value={confirmationText} onChange={e => setConfirmationText(e.target.value)} className="w-full" />
                    </div>

                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setOpened(false)}>
                            {t("common.cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteProject}
                            disabled={confirmationText !== projectName || deleteProjectMutation.isPending}
                            className={cn(deleteProjectMutation.isPending && "opacity-50 cursor-not-allowed")}
                        >
                            {deleteProjectMutation.isPending ? t("settings.dangerZone.delete.dialog.deleting") : t("settings.dangerZone.delete.dialog.confirmButton")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}

export default DangerZone