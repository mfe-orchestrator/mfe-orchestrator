import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { Check, MailPlus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import useInvitationApi, { PendingInvitation } from "@/hooks/apiClients/useInvitationApi"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { cn } from "@/utils/styleUtils"

export const PENDING_INVITATIONS_QUERY_KEY = ["invitations-mine"]

/** Shared so the callers that decide what to render before the answer (e.g. the first-run wizard) see the same data. */
export const usePendingInvitationsQuery = () => {
    const { getMyInvitations } = useInvitationApi()

    return useQuery({
        queryKey: PENDING_INVITATIONS_QUERY_KEY,
        queryFn: getMyInvitations
    })
}

interface PendingInvitationsListProps {
    /** Called after an invitation is accepted, for callers that hold their project list outside react-query. */
    onAccepted?: (invitation: PendingInvitation) => void
    className?: string
}

/**
 * Invitations the user has not answered yet. They are deliberately kept out of the project list:
 * being invited is not the same as being a member, so each one is offered as accept-or-decline.
 * Renders nothing when there is no invitation pending.
 */
const PendingInvitationsList: React.FC<PendingInvitationsListProps> = ({ onAccepted, className }) => {
    const { t } = useTranslation()
    const { acceptMyInvitation, declineMyInvitation } = useInvitationApi()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const { getLocale } = useThemeStore()

    const invitationsQuery = usePendingInvitationsQuery()
    const invitations = invitationsQuery.data ?? []

    // Answering an invitation changes the membership, so the project list has to be refetched too.
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: PENDING_INVITATIONS_QUERY_KEY })
        queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
    }

    const acceptMutation = useMutation({
        mutationFn: (invitation: PendingInvitation) => acceptMyInvitation(invitation.projectId),
        onSuccess: (_result, invitation) => {
            refresh()
            notifications.showSuccessNotification({ message: t("project_invitation.accepted") })
            onAccepted?.(invitation)
        }
    })

    const declineMutation = useMutation({
        mutationFn: (invitation: PendingInvitation) => declineMyInvitation(invitation.projectId),
        onSuccess: () => {
            refresh()
            notifications.showSuccessNotification({ message: t("project_invitation.declined") })
        }
    })

    if (invitations.length === 0) {
        return null
    }

    const isBusy = acceptMutation.isPending || declineMutation.isPending

    return (
        <section className={cn("flex flex-col gap-3 rounded-lg border-2 border-accent/40 bg-accent/5 p-3", className)} data-testid="pending-invitations">
            <div className="flex items-center gap-2">
                <MailPlus className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">{t("project_invitation.pending_count", { count: invitations.length })}</h3>
            </div>

            <ul className="flex flex-col gap-2">
                {invitations.map(invitation => (
                    <li
                        key={invitation.projectId}
                        className="flex flex-col gap-2 rounded-lg bg-background/60 p-3 sm:flex-row sm:items-center sm:gap-3"
                        data-testid={`pending-invitation-${invitation.projectId}`}
                    >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold uppercase text-accent-foreground" aria-hidden="true">
                            {invitation.projectName?.charAt(0) ?? "?"}
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">{invitation.projectName}</span>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground-secondary">
                                <Badge variant="accent">{invitation.role}</Badge>
                                {invitation.expiresAt && (
                                    <span>
                                        {t("project_users.invite_expires")} {format(new Date(invitation.expiresAt), "PPP", { locale: getLocale() })}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-auto">
                            <Button variant="primary" size="sm" onClick={() => acceptMutation.mutate(invitation)} disabled={isBusy} dataTestId={`accept-invitation-${invitation.projectId}`}>
                                <Check />
                                {t("project_invitation.accept_short")}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => declineMutation.mutate(invitation)} disabled={isBusy} dataTestId={`decline-invitation-${invitation.projectId}`}>
                                <X />
                                {t("project_invitation.decline")}
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    )
}

export default PendingInvitationsList
