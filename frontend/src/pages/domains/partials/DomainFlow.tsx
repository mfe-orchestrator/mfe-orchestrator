import { useQueryClient } from "@tanstack/react-query"
import { applyEdgeChanges, applyNodeChanges, Background, Connection, Controls, Edge, EdgeChange, Handle, Node, NodeChange, NodeProps, OnConnectEnd, Panel, Position, ReactFlow } from "@xyflow/react"
import { Server } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/atoms"
import useMicrofrontendsApi, { Microfrontend, MicrofrontendKind } from "@/hooks/apiClients/useMicrofrontendsApi"
import { Service } from "@/hooks/apiClients/useServicesApi"
import { MICROFRONTEND_NODE_TYPE, MicrofrontendFlowNode } from "@/pages/microfrontends/partials/views/MicrofrontendFlowNode"
import useProjectStore from "@/store/useProjectStore"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import "@xyflow/react/dist/style.css"

interface DomainFlowProps {
    microfrontends: Microfrontend[]
    services: Service[]
    onAddMicrofrontend: (parentId?: string) => void
}

interface ServiceNodeData extends Record<string, unknown> {
    service: Service
}

const SERVICE_NODE_TYPE = "service"

/** Sky for the backend, against the primary violet of the microfrontends; the edge needs it as a plain colour. */
const SERVICE_COLOR = "#0ea5e9"
const SERVICE_HANDLE_CLASS =
    "!h-2 !w-2 !rounded-full !border-2 !border-card !bg-foreground-secondary/60 !transition-colors group-[.is-highlighted]:!bg-sky-500 after:absolute after:-inset-2 after:content-['']"

const ServiceFlowNode: React.FC<NodeProps<Node<ServiceNodeData>>> = ({ data }) => {
    const { service } = data
    return (
        <div className="w-60 overflow-hidden rounded-lg border-2 border-l-4 border-border border-l-sky-500 bg-card text-left shadow-sm transition-colors group-[.is-highlighted]:border-sky-500">
            <Handle type="target" position={Position.Top} className={SERVICE_HANDLE_CLASS} />
            <div className="flex items-start gap-2 px-3 pt-2.5">
                <Server className="mt-0.5 size-4 shrink-0 text-sky-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-card-foreground" title={service.name}>
                        {service.name}
                    </div>
                    <div className="truncate text-xs text-foreground-secondary" title={service.slug}>
                        {service.slug}
                    </div>
                </div>
            </div>
            {/* Same height as the chip row of a microfrontend, so the two kinds line up in a row. */}
            <div className="mt-2 flex h-9 items-center gap-1.5 border-t border-divider px-3">
                {service.version && <Badge variant="outline">{service.version}</Badge>}
                {service.stack?.framework && <span className="truncate text-xs text-foreground-secondary">{service.stack.framework}</span>}
            </div>
        </div>
    )
}

/** Defined once, outside the component: React Flow remounts every node when this object changes identity. */
const NODE_TYPES = { [MICROFRONTEND_NODE_TYPE]: MicrofrontendFlowNode, [SERVICE_NODE_TYPE]: ServiceFlowNode }

const NODE_CLASS = "group"
const NODE_HIGHLIGHTED_CLASS = "group is-highlighted"
const NODE_DIMMED_CLASS = "group is-dimmed opacity-40 transition-opacity"

const RELATION_COLOR = "hsl(var(--primary))"
const IDLE_COLOR = "hsl(var(--divider))"

/** Fallback layout for a node that has never been dragged; the services get a row of their own under the microfrontends. */
const NODE_COLUMN_GAP = 300
const NODE_ROW_GAP = 180
const SERVICE_ROW_OFFSET = 220

const FIT_VIEW_OPTIONS = { padding: 0.25, maxZoom: 1 }
const DELETE_KEYS = ["Backspace", "Delete"]

const THEME_TO_COLOR_MODE = {
    [ThemeEnum.LIGHT]: "light",
    [ThemeEnum.DARK]: "dark",
    [ThemeEnum.SYSTEM]: "system"
} as const

type EdgeKind = "relation" | "service"
type DomainEdge = Edge<{ kind: EdgeKind }>

const edgeStyle = (kind: EdgeKind, state: "idle" | "highlighted" | "dimmed") => {
    // A service link keeps its colour at rest, so the backend calls read apart from the host/remote tree.
    const color = state === "highlighted" || kind === "service" ? (kind === "service" ? SERVICE_COLOR : RELATION_COLOR) : IDLE_COLOR
    return {
        style: { stroke: color, strokeWidth: 2, strokeDasharray: kind === "service" ? "6 4" : undefined, opacity: state === "dimmed" ? 0.3 : 1 },
        markerStart: kind === "relation" ? { type: "arrowclosed" as const, width: 16, height: 16, color } : undefined,
        markerEnd: kind === "service" ? { type: "arrowclosed" as const, width: 16, height: 16, color } : undefined,
        animated: state === "highlighted"
    }
}

/**
 * The whole domain on one canvas: the microfrontends with their host/remote links and, in a row under
 * them, the backend services they call. Microfrontend positions are the ones saved on the microfrontend;
 * services have nowhere to save one, so they go back to their row whenever the data reloads.
 */
export const DomainFlow: React.FC<DomainFlowProps> = ({ microfrontends, services, onAddMicrofrontend }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const projectId = useProjectStore(state => state.project?._id)
    const microfrontendsApi = useMicrofrontendsApi()
    const { theme } = useThemeStore()

    const [nodes, setNodes] = useState<Node[]>([])
    const [edges, setEdges] = useState<DomainEdge[]>([])
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

    const microfrontendIds = useMemo(() => new Set(microfrontends.map(mfe => mfe._id!)), [microfrontends])
    const serviceIds = useMemo(() => new Set(services.map(service => service._id!)), [services])
    const frontendIds = useMemo(() => new Set(microfrontends.filter(mfe => mfe.kind === MicrofrontendKind.FRONTEND).map(mfe => mfe._id!)), [microfrontends])

    useEffect(() => {
        const microfrontendNodes = microfrontends.map<Node>((mfe, index) => ({
            id: mfe._id!,
            type: MICROFRONTEND_NODE_TYPE,
            data: { microfrontend: mfe, showKind: true },
            position: { x: mfe.position?.x ?? (index % 3) * NODE_COLUMN_GAP, y: mfe.position?.y ?? Math.floor(index / 3) * NODE_ROW_GAP },
            deletable: false
        }))
        const left = microfrontendNodes.length ? Math.min(...microfrontendNodes.map(node => node.position.x)) : 0
        const top = microfrontendNodes.length ? Math.max(...microfrontendNodes.map(node => node.position.y)) + SERVICE_ROW_OFFSET : 0
        const serviceNodes = services.map<Node>((service, index) => ({
            id: service._id!,
            type: SERVICE_NODE_TYPE,
            data: { service },
            position: { x: left + index * NODE_COLUMN_GAP, y: top },
            deletable: false
        }))
        setNodes([...microfrontendNodes, ...serviceNodes])

        // Links to something outside the domain are left out: there is no node to draw them to.
        setEdges([
            ...microfrontends.flatMap(mfe =>
                (mfe.parentIds ?? [])
                    .filter(parentId => microfrontendIds.has(parentId))
                    .map(parentId => ({ id: `${mfe._id}-${parentId}`, source: parentId, target: mfe._id!, data: { kind: "relation" as const } }))
            ),
            ...microfrontends.flatMap(mfe =>
                (mfe.serviceIds ?? [])
                    .filter(serviceId => serviceIds.has(serviceId))
                    .map(serviceId => ({ id: `${mfe._id}->${serviceId}`, source: mfe._id!, target: serviceId, data: { kind: "service" as const } }))
            )
        ])
    }, [microfrontends, services, microfrontendIds, serviceIds])

    // Hover styling is derived at render time, so it never fights the node and edge state React Flow mutates.
    const connectedIds = useMemo(() => {
        if (!hoveredNodeId) return null
        const ids = new Set([hoveredNodeId])
        for (const edge of edges) {
            if (edge.source === hoveredNodeId) ids.add(edge.target)
            if (edge.target === hoveredNodeId) ids.add(edge.source)
        }
        return ids
    }, [hoveredNodeId, edges])

    const displayedNodes = useMemo(
        () => nodes.map(node => ({ ...node, className: !connectedIds ? NODE_CLASS : connectedIds.has(node.id) ? NODE_HIGHLIGHTED_CLASS : NODE_DIMMED_CLASS })),
        [nodes, connectedIds]
    )
    const displayedEdges = useMemo(
        () =>
            edges.map(edge => {
                const kind = edge.data?.kind ?? "relation"
                const state = !hoveredNodeId ? "idle" : edge.source === hoveredNodeId || edge.target === hoveredNodeId ? "highlighted" : "dimmed"
                return { ...edge, ...edgeStyle(kind, state) }
            }),
        [edges, hoveredNodeId]
    )

    const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ["microfrontends-by-project-id", projectId] }), [queryClient, projectId])

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => {
            for (const change of changes) {
                if (change.type === "position" && change.dragging === false && microfrontendIds.has(change.id)) {
                    microfrontendsApi.setPosition({ id: change.id, ...change.position })
                }
            }
            setNodes(snapshot => applyNodeChanges(changes, snapshot))
        },
        [microfrontendIds, microfrontendsApi.setPosition]
    )

    const onEdgesChange = useCallback(
        async (changes: EdgeChange<DomainEdge>[]) => {
            setEdges(snapshot => applyEdgeChanges<DomainEdge>(changes, snapshot))
            const removed = changes.filter(change => change.type === "remove")
            if (removed.length === 0) return
            try {
                for (const change of removed) {
                    const edge = edges.find(e => e.id === change.id)
                    if (!edge) continue
                    if (edge.data?.kind === "service") await microfrontendsApi.unlinkService(edge.source, edge.target)
                    else await microfrontendsApi.removeRelation({ remote: edge.target, host: edge.source })
                }
            } finally {
                // On a failure too, so the canvas goes back to what is actually saved.
                await refresh()
            }
        },
        [edges, microfrontendsApi.unlinkService, microfrontendsApi.removeRelation, refresh]
    )

    // Only a microfrontend starts a link: to another microfrontend it is a host/remote relation, to a service a backend call.
    // A FRONTEND is served by its own container and cannot have parents, so no relation may end on it.
    const isValidConnection = useCallback(
        (connection: Connection | Edge) => connection.source !== connection.target && microfrontendIds.has(connection.source) && !frontendIds.has(connection.target),
        [microfrontendIds, frontendIds]
    )

    const onConnect = useCallback(
        async ({ source, target }: Connection) => {
            if (serviceIds.has(target)) await microfrontendsApi.linkService(source, target)
            else await microfrontendsApi.setRelation({ remote: target, host: source })
            await refresh()
        },
        [serviceIds, microfrontendsApi.linkService, microfrontendsApi.setRelation, refresh]
    )

    const onConnectEnd: OnConnectEnd = useCallback(
        (_event, connectionState) => {
            // Dropped on the empty canvas: a new remote for the microfrontend the link started from.
            if (!connectionState.toNode && connectionState.fromNode && microfrontendIds.has(connectionState.fromNode.id)) {
                onAddMicrofrontend(connectionState.fromNode.id)
            }
        },
        [microfrontendIds, onAddMicrofrontend]
    )

    const onNodeMouseEnter = useCallback((_event: React.MouseEvent, node: Node) => setHoveredNodeId(node.id), [])
    const onNodeMouseLeave = useCallback(() => setHoveredNodeId(null), [])

    const onNodeDoubleClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            if (node.type === SERVICE_NODE_TYPE) navigate(`/service/${node.id}`)
            if (node.type === MICROFRONTEND_NODE_TYPE) navigate(`/microfrontend/${node.id}`)
        },
        [navigate]
    )

    return (
        <div className="h-[calc(100vh-300px)] min-h-[420px] overflow-hidden rounded-lg border-2 border-border bg-card">
            <ReactFlow
                nodes={displayedNodes}
                edges={displayedEdges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                isValidConnection={isValidConnection}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                onNodeDoubleClick={onNodeDoubleClick}
                deleteKeyCode={DELETE_KEYS}
                colorMode={THEME_TO_COLOR_MODE[theme]}
                fitView
                fitViewOptions={FIT_VIEW_OPTIONS}
                preventScrolling={false}
                snapToGrid
            >
                <Panel position="top-left" className="flex items-center gap-4 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium shadow-sm">
                    <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
                        {t("domains.detail.frontend_title")}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-sky-500" aria-hidden="true" />
                        {t("domains.detail.backend_title")}
                    </span>
                </Panel>
                <Panel position="bottom-right" className="max-w-sm rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground-secondary shadow-sm">
                    {t("domains.detail.flow_hint")}
                </Panel>
                <Background gap={16} color="hsl(var(--divider))" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    )
}

export default DomainFlow
