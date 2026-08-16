import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Connection, Controls, Edge, EdgeChange, Node, NodeChange, OnConnectEnd, ReactFlow } from "@xyflow/react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import useThemeStore, { ThemeEnum } from "@/store/useThemeStore"
import { MICROFRONTEND_NODE_TYPE, MicrofrontendFlowNode } from "./MicrofrontendFlowNode"
import "@xyflow/react/dist/style.css"

interface MicrofrontendFlowProps {
    microfrontends: Microfrontend[]
    onAddNewMicrofrontend: (parentId?: string) => void
}

/** Defined once, outside the component: React Flow remounts every node when this object changes identity. */
const NODE_TYPES = { [MICROFRONTEND_NODE_TYPE]: MicrofrontendFlowNode }

/**
 * The card is drawn by the node itself, so the wrapper only carries the hover state, which the node
 * reads through `group-[.is-highlighted]` rather than by having its classes rewritten from here.
 */
const NODE_CLASS = "group"
const NODE_HIGHLIGHTED_CLASS = "group is-highlighted"
const NODE_DIMMED_CLASS = "group is-dimmed opacity-40 transition-opacity"

const EDGE_COLOR = "hsl(var(--primary))"
const EDGE_BASE_STYLE = { stroke: "hsl(var(--divider))", strokeWidth: 2 }

/** Fallback layout for a microfrontend that has never been dragged: wide enough for the node plus its edges. */
const NODE_COLUMN_GAP = 300
const NODE_ROW_GAP = 180

/** Room around the graph, and a ceiling on the zoom so a two node project is not blown up to fill the canvas. */
const FIT_VIEW_OPTIONS = { padding: 0.25, maxZoom: 1 }

const THEME_TO_COLOR_MODE = {
    [ThemeEnum.LIGHT]: "light",
    [ThemeEnum.DARK]: "dark",
    [ThemeEnum.SYSTEM]: "system"
} as const

export const MicrofrontendFlow: React.FC<MicrofrontendFlowProps> = ({ microfrontends, onAddNewMicrofrontend }) => {
    const [edges, setEdges] = useState<Edge[]>([])
    const [nodes, setNodes] = useState<Node[]>([])
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

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
                        style: EDGE_BASE_STYLE,
                        markerStart: {
                            type: "arrowclosed" as const,
                            width: 16,
                            height: 16,
                            color: EDGE_BASE_STYLE.stroke
                        }
                    })
                }
            }

            return {
                id: mfe._id,
                type: MICROFRONTEND_NODE_TYPE,
                // The node keeps the microfrontend whole and renders it itself, so nothing here has to be
                // rebuilt when the language changes — and the positions dragged since the last drag end,
                // which are the only place they live until then, survive it.
                data: { microfrontend: mfe },
                position: { x: mfe?.position?.x ?? col * NODE_COLUMN_GAP, y: mfe?.position?.y ?? row * NODE_ROW_GAP },
                className: NODE_CLASS
            }
        })
        setNodes(nodes)
        setEdges(edgesList)
    }, [microfrontends])

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
                    style: EDGE_BASE_STYLE,
                    animated: false,
                    markerStart: { type: "arrowclosed" as const, width: 16, height: 16, color: EDGE_BASE_STYLE.stroke }
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
                    style: isConnected ? { stroke: EDGE_COLOR, strokeWidth: 2 } : { ...EDGE_BASE_STYLE, opacity: 0.3 },
                    animated: isConnected,
                    markerStart: {
                        type: "arrowclosed" as const,
                        width: 16,
                        height: 16,
                        color: isConnected ? EDGE_COLOR : EDGE_BASE_STYLE.stroke
                    }
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
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectEnd={onConnectEnd}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                onNodeDoubleClick={onNodeDoubleClick}
                colorMode={THEME_TO_COLOR_MODE[theme]}
                fitView
                // A graph of two or three microfrontends would otherwise be zoomed until a node fills the
                // screen, which is what made the cards look like posters.
                fitViewOptions={FIT_VIEW_OPTIONS}
                preventScrolling={false}
                snapToGrid
            >
                <Background gap={16} color="hsl(var(--divider))" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    )
}

export default MicrofrontendFlow
