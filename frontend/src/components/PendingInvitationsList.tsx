import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { Building2, Check, MailPlus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge, Button } from "@/components/atoms"
import useInvitationApi, { PendingInvitation, PendingOrganizationInvitation } from "@/hooks/apiClients/useInvitationApi"
import useOrganizationStore from "@/store/useOrganizationStore"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"
import { clearProjectIdInLocalStorage, setOrganizationIdInLocalStorage } from "@/utils/localStorageUtils"
import { cn } from "@/utils/styleUtils"

export const PENDING_INVITATIONS_QUERY_KEY = ["invitations-mine"]
export const PENDING_ORGANIZATION_INVITATIONS_QUERY_KEY = ["organization-invitations-mine"]

/** Shared so the callers that decide what to render before the answer (e.g. the first-run wizard) see the same data. */
export const usePendingInvitationsQuery = () => {
    const { getMyInvitations } = useInvitationApi()

    return useQuery({
        queryKey: PENDING_INVITATIONS_QUERY_KEY,
        queryFn: getMyInvitations
    })
}

/** The same, for invitations to an organization: those are answered before any project is in sight. */
export const usePendingOrganizationInvitationsQuery = () => {
    const { getMyOrganizationInvitations } = useInvitationApi()

    return useQuery({
        queryKey: PENDING_ORGANIZATION_INVITATIONS_QUERY_KEY,
        queryFn: getMyOrganizationInvitations
    })
}

/** What the list renders, whichever of the two kinds of invitation it came from. */
interface InvitationRow {
    /** The id of what is being joined: a project, or an organization. */
    id: string
    name: string
    role: string
    expiresAt?: string
    /** Shown under the name when the project lives in an organization other than the current one. */
    elsewhere?: string
}

type InvitationKind = "project" | "organization"

interface PendingInvitationsListProps {
    /** Which invitations to offer. Projects by default, as the project switcher does. */
    kind?: InvitationKind
    /** Called after an invitation is accepted, for callers that hold their list outside react-query. */
    onAccepted?: (invitation: PendingInvitation | PendingOrganizationInvitation) => void
    className?: string
}

/**
 * Invitations the user has not answered yet. They are deliberately kept out of the project and
 * organization lists: being invited is not the same as being a member, so each one is offered as
 * accept-or-decline. Renders nothing when there is no invitation pending.
 */
const PendingInvitationsList: React.FC<PendingInvitationsListProps> = ({ kind = "project", onAccepted, className }) => {
    const { t } = useTranslation()
    const invitationApi = useInvitationApi()
    const queryClient = useQueryClient()
    const notifications = useToastNotificationStore()
    const { getLocale } = useThemeStore()
    const { organization, setOrganization } = useOrganizationStore()

    const projectInvitationsQuery = usePendingInvitationsQuery()
    const organizationInvitationsQuery = usePendingOrganizationInvitationsQuery()
    const isOrganizationKind = kind === "organization"

    const projectInvitations = projectInvitationsQuery.data ?? []
    const organizationInvitations = organizationInvitationsQuery.data ?? []

    // Answering an invitation changes the memberships, so both lists behind it have to be refetched.
    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: PENDING_INVITATIONS_QUERY_KEY })
        queryClient.invalidateQueries({ queryKey: PENDING_ORGANIZATION_INVITATIONS_QUERY_KEY })
        queryClient.invalidateQueries({ queryKey: ["projects-mine"] })
        queryClient.invalidateQueries({ queryKey: ["organizations-mine"] })
    }

    /**
     * Accepting an invitation to a project of another organization moves the user there.
     *
     * The app works inside one organization at a time, so leaving the current one selected would hand
     * back a project list that does not contain the project just accepted.
     */
    const followProjectOrganization = (invitation: PendingInvitation) => {
        if (!invitation.organizationId || invitation.organizationId === organization?._id) {
            return
        }
        setOrganizationIdInLocalStorage(invitation.organizationId)
        clearProjectIdInLocalStorage()
        // Dropped rather than replaced with a half-built record: the organization list is being
        // refetched right after this, and it is what picks up the stored id with the role attached.
        setOrganization(undefined)
    }

    const acceptMutation = useMutation({
        mutationFn: (row: InvitationRow) => (isOrganizationKind ? invitationApi.acceptMyOrganizationInvitation(row.id) : invitationApi.acceptMyInvitation(row.id)),
        onSuccess: (_result, row) => {
            if (isOrganizationKind) {
                const invitation = organizationInvitations.find(candidate => candidate.organizationId === row.id)
                refresh()
                notifications.showSuccessNotification({ message: t("organization_invitation.accepted") })
                if (invitation) onAccepted?.(invitation)
                return
            }

            const invitation = projectInvitations.find(candidate => candidate.projectId === row.id)
            if (invitation) followProjectOrganization(invitation)
            refresh()
            notifications.showSuccessNotification({ message: t("project_invitation.accepted") })
            if (invitation) onAccepted?.(invitation)
        }
    })

    const declineMutation = useMutation({
        mutationFn: (row: InvitationRow) => (isOrganizationKind ? invitationApi.declineMyOrganizationInvitation(row.id) : invitationApi.declineMyInvitation(row.id)),
        onSuccess: () => {
            refresh()
            notifications.showSuccessNotification({ message: t(isOrganizationKind ? "organization_invitation.declined" : "project_invitation.declined") })
        }
    })

    const rows: InvitationRow[] = isOrganizationKind
        ? organizationInvitations.map(invitation => ({
              id: invitation.organizationId,
              name: invitation.organizationName,
              role: invitation.role,
              expiresAt: invitation.expiresAt
          }))
        : projectInvitations.map(invitation => ({
              id: invitation.projectId,
              name: invitation.projectName,
              role: invitation.role,
              expiresAt: invitation.expiresAt,
              elsewhere: invitation.organizationId && invitation.organizationId !== organization?._id ? invitation.organizationName : undefined
          }))

    if (rows.length === 0) {
        return null
    }

    const isBusy = acceptMutation.isPending || declineMutation.isPending

    return (
        <section
            className={cn("flex flex-col gap-3 rounded-lg border-2 border-accent/40 bg-accent/5 p-3", className)} // The project list keeps the plain name it always had: it is what the tests hang on.
            data-testid={isOrganizationKind ? "pending-organization-invitations" : "pending-invitations"}
        >
            <div className="flex items-center gap-2">
                <MailPlus className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">
                    {t(isOrganizationKind ? "organization_invitation.pending_count" : "project_invitation.pending_count", { count: rows.length })}
                </h3>
            </div>

            <ul className="flex flex-col gap-2">
                {rows.map(row => (
                    <li key={row.id} className="flex flex-col gap-2 rounded-lg bg-background/60 p-3 sm:flex-row sm:items-center sm:gap-3" data-testid={`pending-invitation-${row.id}`}>
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold uppercase text-accent-foreground" aria-hidden="true">
                            {row.name?.charAt(0) ?? "?"}
                        </span>
                        <div className="flex min-w-0 flex-col">
                            <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground-secondary">
                                <Badge variant="accent">{row.role}</Badge>
                                {/* Says where accepting will take them: the switch is otherwise invisible. */}
                                {row.elsewhere && (
                                    <span className="flex items-center gap-1">
                                        <Building2 className="size-3" aria-hidden="true" />
                                        {row.elsewhere}
                                    </span>
                                )}
                                {row.expiresAt && (
                                    <span>
                                        {t("project_users.invite_expires")} {format(new Date(row.expiresAt), "PPP", { locale: getLocale() })}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-auto">
                            <Button variant="primary" size="sm" onClick={() => acceptMutation.mutate(row)} disabled={isBusy} dataTestId={`accept-invitation-${row.id}`}>
                                <Check />
                                {t("project_invitation.accept_short")}
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => declineMutation.mutate(row)} disabled={isBusy} dataTestId={`decline-invitation-${row.id}`}>
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
