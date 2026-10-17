import { EmptyState } from "@mfe-orchestrator/design-system"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { applyEdgeChanges, Background, Connection, Controls, Edge, EdgeChange, Handle, Node, NodeProps, Panel, Position, ReactFlow } from "@xyflow/react"
import { CirclePlus, Server } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { ApiStatusHandler } from "@/components/organisms"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useServicesApi, { Service } from "@/hooks/apiClients/useServicesApi"
import useProjectStore from "@/store/useProjectStore"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import "@xyflow/react/dist/style.css"

interface MicrofrontendsBackendFlowProps {
    microfrontends: Microfrontend[]
}

interface LinkNodeData extends Record<string, unknown> {
    name: string
    slug: string
    version?: string
}

/** Same look as the handles of the microfrontend graph, with a hit area larger than the dot. */
const HANDLE_CLASS = "!h-2.5 !w-2.5 !rounded-full !border-2 !border-card !bg-primary after:absolute after:-inset-2 after:content-['']"

/** Microfrontends only start a link and services only end one, so a link always reads left to right. */
const LinkNode: React.FC<NodeProps<Node<LinkNodeData>> & { side: "microfrontend" | "service" }> = ({ data, side }) => (
    <div className="flex w-60 items-center gap-2 rounded-lg border-2 border-border bg-card px-3 py-2.5 text-left shadow-sm">
        {side === "service" && <Handle type="target" position={Position.Left} className={HANDLE_CLASS} />}
        {side === "service" && <Server className="h-4 w-4 shrink-0 text-foreground-secondary" />}
        <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-card-foreground" title={data.name}>
                {data.name}
            </div>
            <div className="truncate text-xs text-foreground-secondary" title={data.slug}>
                {data.slug}
            </div>
        </div>
        {data.version && (
            <Badge variant="outline" className="shrink-0">
                {data.version}
            </Badge>
        )}
        {side === "microfrontend" && <Handle type="source" position={Position.Right} className={HANDLE_CLASS} />}
    </div>
)

/** A column heading, drawn in the canvas so it pans and zooms with the column under it. */
const ColumnLabelNode: React.FC<NodeProps<Node<{ label: string }>>> = ({ data }) => <div className="w-60 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">{data.label}</div>

/** Defined once, outside the component: React Flow remounts every node when this object changes identity. */
const NODE_TYPES = {
    columnLabel: ColumnLabelNode,
    microfrontend: (props: NodeProps<Node<LinkNodeData>>) => <LinkNode {...props} side="microfrontend" />,
    service: (props: NodeProps<Node<LinkNodeData>>) => <LinkNode {...props} side="service" />
}

const COLUMN_X = { microfrontend: 0, service: 480 }
const ROW_GAP = 90
const LABEL_Y = -50
const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1 }
const EDGE_STYLE = { stroke: "hsl(var(--primary))", strokeWidth: 2 }
const DELETE_KEYS = ["Backspace", "Delete"]
/** One empty list for every render: a fresh `[]` would rebuild the edges, and reset them, on each one. */
const NO_SERVICES: Service[] = []

const THEME_TO_COLOR_MODE = {
    [ThemeEnum.LIGHT]: "light",
    [ThemeEnum.DARK]: "dark",
    [ThemeEnum.SYSTEM]: "system"
} as const

const edgeId = (microfrontendId: string, serviceId: string) => `${microfrontendId}->${serviceId}`

/**
 * Which microfrontend calls which backend service: microfrontends on the left, the backend containers
 * in a column of their own on the right. The links are drawn by hand, since nothing in a build says
 * which API a microfrontend talks to.
 */
export const MicrofrontendsBackendFlow: React.FC<MicrofrontendsBackendFlowProps> = ({ microfrontends }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)
    const microfrontendsApi = useMicrofrontendsApi()
    const servicesApi = useServicesApi()
    const { theme } = useThemeStore()

    const servicesQuery = useQuery({
        queryKey: ["services", projectId],
        queryFn: servicesApi.getAll,
        enabled: !!projectId
    })
    const services = servicesQuery.data ?? NO_SERVICES

    // The headings are keyed on the language, so they are the only nodes a language switch rebuilds.
    const nodes = useMemo<Node[]>(
        () => [
            ...(["microfrontend", "service"] as const).map(side => ({
                id: `label-${side}`,
                type: "columnLabel",
                data: { label: t(side === "microfrontend" ? "microfrontend.backendLinks.microfrontendsColumn" : "microfrontend.backendLinks.servicesColumn") },
                position: { x: COLUMN_X[side], y: LABEL_Y },
                selectable: false,
                connectable: false,
                deletable: false
            })),
            ...microfrontends.map((mfe, index) => ({
                id: mfe._id!,
                type: "microfrontend",
                data: { name: mfe.name, slug: mfe.slug, version: mfe.version },
                position: { x: COLUMN_X.microfrontend, y: index * ROW_GAP },
                deletable: false
            })),
            ...services.map((service, index) => ({
                id: service._id!,
                type: "service",
                data: { name: service.name, slug: service.slug, version: service.version },
                position: { x: COLUMN_X.service, y: index * ROW_GAP },
                deletable: false
            }))
        ],
        [microfrontends, services, t]
    )

    // Links to a service deleted since are left out: there is no node to draw them to.
    const savedEdges = useMemo<Edge[]>(() => {
        const serviceIds = new Set(services.map(service => service._id))
        return microfrontends.flatMap(mfe =>
            (mfe.serviceIds ?? []).filter(serviceId => serviceIds.has(serviceId)).map(serviceId => ({ id: edgeId(mfe._id!, serviceId), source: mfe._id!, target: serviceId, style: EDGE_STYLE }))
        )
    }, [microfrontends, services])

    // Kept in state only so an edge can be selected, which is what lets the delete key remove it.
    const [edges, setEdges] = useState<Edge[]>(savedEdges)
    useEffect(() => setEdges(savedEdges), [savedEdges])

    const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["microfrontends-by-project-id", projectId] }), [queryClient, projectId])

    const onConnect = useCallback(
        async ({ source, target }: Connection) => {
            await microfrontendsApi.linkService(source, target)
            await refresh()
        },
        [microfrontendsApi.linkService, refresh]
    )

    const onEdgesChange = useCallback(
        async (changes: EdgeChange[]) => {
            setEdges(snapshot => applyEdgeChanges(changes, snapshot))
            const removed = changes.filter(change => change.type === "remove")
            if (removed.length === 0) return
            try {
                for (const change of removed) {
                    const edge = edges.find(e => e.id === change.id)
                    if (edge) await microfrontendsApi.unlinkService(edge.source, edge.target)
                }
            } finally {
                // On a failure too, so the canvas goes back to what is actually saved.
                await refresh()
            }
        },
        [edges, microfrontendsApi.unlinkService, refresh]
    )

    const onNodeDoubleClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            if (node.type === "service") navigate(`/service/${node.id}`)
            if (node.type === "microfrontend") navigate(`/microfrontend/${node.id}`)
        },
        [navigate]
    )

    return (
        <ApiStatusHandler queries={[servicesQuery]}>
            {services.length === 0 ? (
                <EmptyState
                    variant="outlined"
                    size="lg"
                    tone="primary"
                    icon={<Server />}
                    title={t("microfrontend.backendLinks.noServicesTitle")}
                    description={t("microfrontend.backendLinks.noServicesDescription")}
                    actions={
                        <Button onClick={() => navigate("/service/new")}>
                            <CirclePlus />
                            {t("microfrontend.backendLinks.createService")}
                        </Button>
                    }
                />
            ) : (
                <div className="h-[calc(100vh-300px)] min-h-[420px] overflow-hidden rounded-lg border-2 border-border bg-card">
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        nodeTypes={NODE_TYPES}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeDoubleClick={onNodeDoubleClick}
                        nodesDraggable={false}
                        deleteKeyCode={DELETE_KEYS}
                        colorMode={THEME_TO_COLOR_MODE[theme]}
                        fitView
                        fitViewOptions={FIT_VIEW_OPTIONS}
                        preventScrolling={false}
                    >
                        <Panel position="bottom-right" className="max-w-sm rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground-secondary shadow-sm">
                            {t("microfrontend.backendLinks.hint")}
                        </Panel>
                        <Background gap={16} color="hsl(var(--divider))" />
                        <Controls showInteractive={false} />
                    </ReactFlow>
                </div>
            )}
        </ApiStatusHandler>
    )
}

export default MicrofrontendsBackendFlow
