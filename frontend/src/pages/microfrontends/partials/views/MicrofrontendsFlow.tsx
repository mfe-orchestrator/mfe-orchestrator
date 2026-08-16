import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Connection, Controls, Edge, EdgeChange, Node, NodeChange, OnConnectEnd, ReactFlow } from "@xyflow/react"
import { useCallback, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge } from "@/components/atoms"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import CloneRepositoryPopover from "../components/CloneRepositoryPopover"
import "@xyflow/react/dist/style.css"

interface MicrofrontendFlowProps {
    microfrontends: Microfrontend[]
    onAddNewMicrofrontend: (parentId?: string) => void
}

/** React Flow ships its own node styling, so the theme tokens have to be forced in. */
const NODE_BASE_CLASS = "!rounded-md !border-2 !bg-card !px-3 !py-2 !text-sm !font-medium !text-card-foreground !shadow-none"
const NODE_CLASS = `${NODE_BASE_CLASS} !border-border`
const NODE_HIGHLIGHTED_CLASS = `${NODE_BASE_CLASS} !border-primary`
const NODE_DIMMED_CLASS = `${NODE_CLASS} opacity-40`

const EDGE_COLOR = "hsl(var(--primary))"

const THEME_TO_COLOR_MODE = {
    [ThemeEnum.LIGHT]: "light",
    [ThemeEnum.DARK]: "dark",
    [ThemeEnum.SYSTEM]: "system"
} as const

export const MicrofrontendFlow: React.FC<MicrofrontendFlowProps> = ({ microfrontends, onAddNewMicrofrontend }) => {
    const [edges, setEdges] = useState<Edge[]>([])
    const [nodes, setNodes] = useState<Node[]>([])
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

    const { t } = useTranslation("platform")
    const navigate = useNavigate()
    const microfrontendApi = useMicrofrontendsApi()
    const { theme } = useThemeStore()

    useEffect(() => {
        const edgesList: Edge[] = []
        const nodes = microfrontends.map<Node>((mfe, index) => {
            const col = index % 3
            const row = Math.floor(index / 3)

            if (mfe.parentIds) {
                for (const parentId of mfe.parentIds) {
                    edgesList.push({
                        id: mfe._id + "-" + parentId,
                        source: parentId,
                        target: mfe._id,
                        markerStart: {
                            type: "arrowclosed" as const,
                            width: 20,
                            height: 20
                        }
                    })
                }
            }

            return {
                id: mfe._id,
                data: {
                    label: (
                        <div className="flex flex-col items-center gap-1.5">
                            <span className="truncate">{mfe.name}</span>
                            <span className="flex flex-wrap items-center justify-center gap-1">
                                <Badge variant="outline" title={t("microfrontend.card.version", { version: mfe.version })}>
                                    {mfe.version}
                                </Badge>
                                {mfe.canary?.enabled && <Badge>{t("microfrontend.card.canary")}</Badge>}
                            </span>
                            {/* nodrag/nopan keep React Flow from hijacking the click; stopPropagation keeps a double click from navigating away. */}
                            <span className="nodrag nopan absolute -right-2.5 -top-2.5" onDoubleClick={event => event.stopPropagation()}>
                                <CloneRepositoryPopover microfrontend={mfe} iconOnly />
                            </span>
                        </div>
                    )
                },
                position: { x: mfe?.position?.x || col * 250, y: mfe?.position?.y || row * 150 },
                dimensions: { width: mfe?.position?.width, height: mfe?.position?.height },
                className: NODE_CLASS
            }
        })
        setNodes(nodes)
        setEdges(edgesList)
    }, [microfrontends, t])

    useEffect(() => {
        if (!hoveredNodeId) {
            // Reset degli stili quando non c'è hover
            setNodes(nodes =>
                nodes.map(node => ({
                    ...node,
                    className: NODE_CLASS
                }))
            )
            setEdges(edges =>
                edges.map(edge => ({
                    ...edge,
                    style: undefined,
                    animated: false
                }))
            )
            return
        }

        // Trova gli edge collegati al nodo in hover (sia come sorgente che come target)
        const childEdges = edges.filter(edge => edge.source === hoveredNodeId)
        const parentEdges = edges.filter(edge => edge.target === hoveredNodeId)

        const childNodeIds = new Set(childEdges.map(edge => edge.target))
        const parentNodeIds = new Set(parentEdges.map(edge => edge.source))
        const connectedNodeIds = new Set([...childNodeIds, ...parentNodeIds])

        // Applica stili ai nodi
        setNodes(nodes =>
            nodes.map(node => {
                const isConnected = connectedNodeIds.has(node.id)
                const isHovered = node.id === hoveredNodeId
                return {
                    ...node,
                    className: isHovered || isConnected ? NODE_HIGHLIGHTED_CLASS : NODE_DIMMED_CLASS
                }
            })
        )

        // Applica stili agli edge
        setEdges(edges =>
            edges.map(edge => {
                const isConnectedAsChild = edge.source === hoveredNodeId
                const isConnectedAsParent = edge.target === hoveredNodeId
                const isConnected = isConnectedAsChild || isConnectedAsParent

                return {
                    ...edge,
                    style: isConnected ? { stroke: EDGE_COLOR, strokeWidth: 2 } : { opacity: 0.3, strokeWidth: 2 },
                    animated: isConnected,
                    markerStart: isConnected
                        ? {
                              type: "arrowclosed" as const,
                              width: 20,
                              height: 20,
                              color: EDGE_COLOR
                          }
                        : edge.markerStart
                }
            })
        )
    }, [hoveredNodeId, edges.filter])

    const onNodesChange = useCallback(
        async (changes: NodeChange[]) => {
            for (const change of changes) {
                if (change.type === "position" && change.dragging == false) {
                    microfrontendApi.setPosition({ id: change.id, ...change.position })
                }
                if (change.type === "dimensions" && change.resizing == false) {
                    microfrontendApi.setDimensions({ id: change.id, ...change.dimensions })
                }
            }
            setNodes(nodesSnapshot => applyNodeChanges(changes, nodesSnapshot))
        },
        [microfrontendApi.setPosition, microfrontendApi.setDimensions]
    )

    const onEdgesChange = useCallback(
        async (changes: EdgeChange[]) => {
            for (const change of changes) {
                if (change.type === "remove") {
                    const edgeToRemove = edges.find(e => e.id === change.id)
                    if (edgeToRemove && edgeToRemove.source && edgeToRemove.target) {
                        await microfrontendApi.removeRelation({
                            remote: edgeToRemove.source,
                            host: edgeToRemove.target
                        })
                    }
                }
            }

            setEdges(edgesSnapshot => applyEdgeChanges(changes, edgesSnapshot))
        },
        [edges, microfrontendApi]
    )
    const onConnect = useCallback(
        async (params: Connection) => {
            const newEdge: Edge = {
                ...params,
                id: params.source + "-" + params.target,
                markerStart: {
                    type: "arrowclosed" as const,
                    width: 20,
                    height: 20
                }
            }
            await microfrontendApi.setRelation({ remote: params.target, host: params.source })
            setEdges(edgesSnapshot => addEdge(newEdge, edgesSnapshot))
        },
        [microfrontendApi.setRelation]
    )

    const onConnectEnd: OnConnectEnd = useCallback(
        (_event, connectionState) => {
            // Se la connessione non ha un target (viene droppata nel vuoto)
            if (!connectionState.toNode) {
                onAddNewMicrofrontend(connectionState.fromNode?.id!)
            }
        },
        [onAddNewMicrofrontend]
    )

    const onNodeMouseEnter = useCallback((_event: React.MouseEvent, node: Node) => {
        setHoveredNodeId(node.id)
    }, [])

    const onNodeMouseLeave = useCallback(() => {
        setHoveredNodeId(null)
    }, [])

    const onNodeDoubleClick = useCallback(
        (_event: React.MouseEvent, node: Node) => {
            navigate(`/microfrontend/${node.id}`)
        },
        [navigate]
    )

    return (
        // Sized against the viewport minus the app chrome and the page header, so the canvas never pushes the page into a scroll.
        <div className="h-[calc(100vh-300px)] min-h-[420px] overflow-hidden rounded-lg border-2 border-border bg-card">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                onNodeDoubleClick={onNodeDoubleClick}
                colorMode={THEME_TO_COLOR_MODE[theme]}
                fitView
                preventScrolling={false}
                snapToGrid
            >
                <Background gap={16} color="hsl(var(--divider))" />
                <Controls />
            </ReactFlow>
        </div>
    )
}

export default MicrofrontendFlow
