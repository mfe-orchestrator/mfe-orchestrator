import { addEdge, applyEdgeChanges, applyNodeChanges, Background, Connection, Controls, Edge, EdgeChange, Node, NodeChange, OnConnectEnd, ReactFlow } from "@xyflow/react"
import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import "@xyflow/react/dist/style.css"
import AddNewMicrofrontendCard from "../components/AddNewMicrofrontendCard"

interface MicrofrontendFlowProps {
    microfrontends: Microfrontend[]
    onAddNewMicrofrontend: (parentId?: string) => void
}

export const MicrofrontendFlow: React.FC<MicrofrontendFlowProps> = ({ microfrontends, onAddNewMicrofrontend }) => {
    const [edges, setEdges] = useState<Edge[]>([])
    const [nodes, setNodes] = useState<Node[]>([])
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

    const navigate = useNavigate()
    const microfrontendApi = useMicrofrontendsApi()

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
                data: { label: mfe.name },
                position: { x: mfe?.position?.x || col * 250, y: mfe?.position?.y || row * 150 },
                dimensions: { width: mfe?.position?.width, height: mfe?.position?.height },
                className: "!bg-white dark:!bg-gray-800 !border-2 !border-gray-200 dark:!border-white !text-gray-900 dark:!text-gray-100 rounded-lg"
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
                    className: "!bg-white dark:!bg-gray-800 !border-2 !border-gray-200 dark:!border-white !text-gray-900 dark:!text-gray-100 rounded-lg"
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
                    className: isHovered || isConnected
                        ? "!bg-white dark:!bg-gray-800 !border-2 !border-purple-500 dark:!border-purple-500 !text-gray-900 dark:!text-gray-100 rounded-lg"
                        : "!bg-white dark:!bg-gray-800 !border-2 !border-gray-200 dark:!border-white !text-gray-900 dark:!text-gray-100 rounded-lg opacity-50"
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
                    style: isConnected ? { stroke: "#a855f7", strokeWidth: 2 } : { opacity: 0.3, strokeWidth: 2 },
                    animated: isConnected,
                    markerStart: isConnected
                        ? {
                            type: "arrowclosed" as const,
                            width: 20,
                            height: 20,
                            color: "#a855f7"
                        }
                        : edge.markerStart
                }
            })
        )
    }, [hoveredNodeId])

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
            console.log(changes)

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

    const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
        navigate(`/microfrontend/${node.id}`)
    }, [navigate])

    if (!microfrontends || microfrontends.length === 0) {
        return <div className="flex">
            <AddNewMicrofrontendCard onAddNewMicrofrontend={() => onAddNewMicrofrontend()} className={"flex-1"} />
        </div>
    }

    return (
        <div className="h-[calc(100vh-96px)] border-2 border-border rounded-md">
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
                fitView
                preventScrolling={false}
                snapToGrid
            >
                <Background gap={16} />
                <Controls />
            </ReactFlow>
        </div>
    )
}

export default MicrofrontendFlow