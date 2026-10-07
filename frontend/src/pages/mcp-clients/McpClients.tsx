import { Card, CardContent, CardDescription, CardHeader, CardTitle, CopyableValue, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@mfe-orchestrator/design-system"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { format } from "date-fns"
import { Bot, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import SinglePageLayout from "@/components/SinglePageLayout"
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog"
import { useGlobalParameters } from "@/contexts/GlobalParameterProvider"
import useMcpClientsApi, { McpClient } from "@/hooks/apiClients/useMcpClientsApi"
import useProjectStore from "@/store/useProjectStore"
import useThemeStore from "@/store/useThemeStore"
import useToastNotificationStore from "@/store/useToastNotificationStore"

export const McpClients = () => {
    const { t } = useTranslation()
    const mcpClientsApi = useMcpClientsApi()
    const queryClient = useQueryClient()
    const { project } = useProjectStore()
    const themeStore = useThemeStore()
    const notifications = useToastNotificationStore()
    const { getParameter } = useGlobalParameters()
    const mcpEnabled = getParameter("mcp.enabled") === true
    const mcpUrl = String(getParameter("mcp.url") ?? "")

    const apiKeySnippets = [
        { id: "claude-code", label: t("mcpClients.apiKey.claudeCode"), value: `claude mcp add --transport http mfe-orchestrator ${mcpUrl} --header "Authorization: Bearer <YOUR_API_KEY>"` },
        {
            id: "gemini-cli",
            label: t("mcpClients.apiKey.geminiCli"),
            value: JSON.stringify({ mcpServers: { "mfe-orchestrator": { httpUrl: mcpUrl, headers: { Authorization: "Bearer <YOUR_API_KEY>" } } } })
        },
        {
            id: "cursor",
            label: t("mcpClients.apiKey.cursor"),
            value: JSON.stringify({ mcpServers: { "mfe-orchestrator": { url: mcpUrl, headers: { Authorization: "Bearer <YOUR_API_KEY>" } } } })
        }
    ]

    const [clientToRevoke, setClientToRevoke] = useState<McpClient | null>(null)

    const clientsQuery = useQuery({
        queryKey: ["mcp-clients", project?._id],
        queryFn: () => mcpClientsApi.getMcpClients(project?._id || ""),
        enabled: mcpEnabled && !!project?._id
    })

    const revokeMutation = useMutation({
        mutationFn: mcpClientsApi.revokeMcpClient,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["mcp-clients", project?._id] })
            notifications.showSuccessNotification({ message: t("mcpClients.revoked") })
        }
    })

    const formatDate = (value?: string) => (value ? format(new Date(value), "PPP", { locale: themeStore.getLocale() }) : t("mcpClients.never"))

    if (!mcpEnabled) {
        return (
            <SinglePageLayout title={t("mcpClients.title")} description={t("mcpClients.description")}>
                <Card>
                    <CardContent>
                        <EmptyState size="lg" tone="accent" titleAs="h3" icon={<Bot />} title={t("mcpClients.disabled_title")} description={t("mcpClients.disabled_description")} />
                    </CardContent>
                </Card>
            </SinglePageLayout>
        )
    }

    return (
        <>
            <SinglePageLayout title={t("mcpClients.title")} description={t("mcpClients.description")}>
                <Card>
                    <CardHeader>
                        <CardTitle as="h2">{t("mcpClients.connect_title")}</CardTitle>
                        <CardDescription>{t("mcpClients.connect_description")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CopyableValue value={mcpUrl} copyLabel={t("mcpClients.copy_url")} copiedLabel={t("common.copied")} dataTestId="mcp-url" />
                        <p className="mt-3 text-sm text-muted-foreground">{t("mcpClients.connect_login_hint")}</p>
                        <details className="mt-4" data-testid="mcp-api-key-section">
                            <summary className="cursor-pointer font-medium">{t("mcpClients.apiKey.title")}</summary>
                            <div className="mt-3 flex flex-col gap-3">
                                <p className="text-sm text-muted-foreground">
                                    {t("mcpClients.apiKey.description")}{" "}
                                    <Link to="/api-keys" className="underline">
                                        {t("mcpClients.apiKey.createLink")}
                                    </Link>
                                    . {t("mcpClients.apiKey.roleNote")}
                                </p>
                                {apiKeySnippets.map(snippet => (
                                    <div key={snippet.id}>
                                        <p className="mb-1 text-sm font-medium">{snippet.label}</p>
                                        <CopyableValue value={snippet.value} copyLabel={t("mcpClients.apiKey.copySnippet")} copiedLabel={t("common.copied")} dataTestId={`mcp-snippet-${snippet.id}`} />
                                    </div>
                                ))}
                            </div>
                        </details>
                    </CardContent>
                </Card>
                <ApiStatusHandler queries={[clientsQuery]}>
                    <Card>
                        <CardContent>
                            {clientsQuery.data?.length === 0 ? (
                                <EmptyState size="lg" titleAs="h3" icon={<Bot />} title={t("mcpClients.no_clients")} description={t("mcpClients.no_clients_desc")} />
                            ) : (
                                <Table>
                                    <TableHeader tinted={false}>
                                        <TableRow>
                                            <TableHead>{t("mcpClients.client")}</TableHead>
                                            <TableHead>{t("mcpClients.projects")}</TableHead>
                                            <TableHead>{t("mcpClients.user")}</TableHead>
                                            <TableHead>{t("mcpClients.access")}</TableHead>
                                            <TableHead>{t("mcpClients.connected")}</TableHead>
                                            <TableHead>{t("mcpClients.last_used")}</TableHead>
                                            <TableHead className="text-right">{t("common.actions")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {clientsQuery.data?.map(client => (
                                            <TableRow key={client.id} data-testid={`mcp-client-row-${client.id}`}>
                                                <TableCell className="font-medium">{client.clientName}</TableCell>
                                                <TableCell className="text-muted-foreground">{client.projects?.map(p => p.name).join(", ")}</TableCell>
                                                <TableCell className="text-muted-foreground">{client.userEmail}</TableCell>
                                                <TableCell>
                                                    <Badge variant={client.scopes.includes("mfe:write") ? "default" : "outline"}>
                                                        {client.scopes.includes("mfe:write") ? t("mcpClients.access_write") : t("mcpClients.access_read")}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{formatDate(client.createdAt)}</TableCell>
                                                <TableCell className="text-muted-foreground">{formatDate(client.lastUsedAt)}</TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={t("mcpClients.revoke_aria", { name: client.clientName })}
                                                        disabled={revokeMutation.isPending}
                                                        onClick={() => setClientToRevoke(client)}
                                                        dataTestId={`mcp-client-revoke-${client.id}`}
                                                    >
                                                        <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </ApiStatusHandler>
            </SinglePageLayout>
            <DeleteConfirmationDialog
                isOpen={!!clientToRevoke}
                onOpenChange={open => {
                    if (!open) setClientToRevoke(null)
                }}
                onDelete={async () => {
                    if (clientToRevoke) {
                        await revokeMutation.mutateAsync(clientToRevoke.id)
                    }
                }}
                onDeleteSuccess={() => setClientToRevoke(null)}
                title={t("mcpClients.revoke_title")}
                description={clientToRevoke ? t("mcpClients.confirm_revoke", { name: clientToRevoke.clientName }) : ""}
            />
        </>
    )
}

export default McpClients
