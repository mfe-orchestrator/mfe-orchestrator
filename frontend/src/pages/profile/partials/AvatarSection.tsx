import { Avatar, AvatarFallback, AvatarImage, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@mfe-orchestrator/design-system"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2, Upload, User as UserIcon } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/atoms"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import useUserApi, { User } from "@/hooks/apiClients/useUserApi"
import useProfilePicture, { PROFILE_AVATAR_QUERY_KEY } from "@/hooks/useProfilePicture"
import useToastNotificationStore from "@/store/useToastNotificationStore"

// Stessi limiti che applica il backend in UserAvatarModel: ricontrollarli qui
// evita di spedire un upload che verrebbe comunque rifiutato.
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]
const MAX_SIZE_BYTES = 1024 * 1024

interface AvatarSectionProps {
    user: User
}

export const AvatarSection: React.FC<AvatarSectionProps> = ({ user }) => {
    const { t } = useTranslation()
    const { uploadAvatar, deleteAvatar } = useUserApi()
    const notifications = useToastNotificationStore()
    const queryClient = useQueryClient()
    const avatarQuery = useProfilePicture()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

    const initials =
        [user.name, user.surname]
            .filter(Boolean)
            .map(value => value?.[0]?.toUpperCase())
            .join("") || undefined

    const uploadMutation = useMutation({
        mutationFn: uploadAvatar,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROFILE_AVATAR_QUERY_KEY })
            notifications.showSuccessNotification({ message: t("profile.avatar.notifications.uploaded") })
        }
    })

    const deleteMutation = useMutation({
        mutationFn: deleteAvatar,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: PROFILE_AVATAR_QUERY_KEY })
            notifications.showSuccessNotification({ message: t("profile.avatar.notifications.deleted") })
        }
    })

    const onFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        // Il valore va azzerato subito, altrimenti riselezionare lo stesso file
        // dopo un errore non fa scattare l'evento change.
        event.target.value = ""
        if (!file) return

        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            notifications.showErrorNotification({ message: t("profile.avatar.errors.invalidFormat") })
            return
        }

        if (file.size > MAX_SIZE_BYTES) {
            notifications.showErrorNotification({ message: t("profile.avatar.errors.tooLarge", { size: "1 MB" }) })
            return
        }

        uploadMutation.mutate(file)
    }

    const isBusy = uploadMutation.isPending || deleteMutation.isPending

    return (
        <Card className="pt-4">
            <CardHeader>
                <CardTitle as="h2">{t("profile.avatar.title")}</CardTitle>
                <CardDescription>{t("profile.avatar.subtitle")}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="flex items-center gap-6 flex-wrap">
                    <div data-testid="profile-avatar">
                        <Avatar className="h-20 w-20 border-2 border-border">
                            {avatarQuery.data && <AvatarImage src={avatarQuery.data} alt={t("profile.avatar.title")} />}
                            <AvatarFallback>{initials ?? <UserIcon className="h-8 w-8" />}</AvatarFallback>
                        </Avatar>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 flex-wrap">
                            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={isBusy} dataTestId="profile-avatar-upload">
                                <Upload />
                                {uploadMutation.isPending ? t("profile.avatar.uploading") : t("profile.avatar.upload")}
                            </Button>
                            {avatarQuery.data && (
                                <Button variant="ghost-destructive" onClick={() => setIsDeleteDialogOpen(true)} disabled={isBusy} dataTestId="profile-avatar-remove">
                                    <Trash2 />
                                    {t("profile.avatar.remove")}
                                </Button>
                            )}
                        </div>
                        <p className="text-sm text-foreground-secondary m-0">{t("profile.avatar.hint", { size: "1 MB" })}</p>
                    </div>

                    <input ref={fileInputRef} type="file" accept={ALLOWED_MIME_TYPES.join(",")} className="hidden" onChange={onFileSelected} data-testid="profile-avatar-input" />
                </div>
            </CardContent>

            <DeleteConfirmationDialog
                isOpen={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                onDelete={() => deleteMutation.mutateAsync()}
                title={t("profile.avatar.delete.title")}
                description={t("profile.avatar.delete.confirmation")}
            />
        </Card>
    )
}

export default AvatarSection
