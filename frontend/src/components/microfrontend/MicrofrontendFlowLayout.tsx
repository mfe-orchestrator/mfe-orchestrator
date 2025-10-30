import { addEdge, applyEdgeChanges, applyNodeChanges, Connection, Edge, EdgeChange, Node, NodeChange, OnConnectEnd, ReactFlow } from "@xyflow/react"
import { useCallback, useEffect, useState } from "react"
import useMicrofrontendsApi, { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import "@xyflow/react/dist/style.css"

interface MicrofrontendFlowLayoutProps {
    microfrontends: Microfrontend[]
    onAddNewMicrofrontend: (parentId: string) => void
}

const MicrofrontendFlowLayout: React.FC<MicrofrontendFlowLayoutProps> = ({ microfrontends, onAddNewMicrofrontend }) => {
    const [edges, setEdges] = useState<Edge[]>([])
    const [nodes, setNodes] = useState<Node[]>([])

    const microfrontendApi = useMicrofrontendsApi()

    useEffect(() => {
        const edges: Edge[] = []
        const nodes = microfrontends.map<Node>((mfe, index) => {
            const col = index % 3
            const row = Math.floor(index / 3)

            if (mfe.parentIds) {
                for (const parentId of mfe.parentIds) {
                    edges.push({
                        id: mfe._id,
                        source: mfe._id,
                        target: parentId,
                        markerEnd: {
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
                dimensions: { width: mfe?.position?.width, height: mfe?.position?.height }
            }
        })
        setNodes(nodes)
        setEdges(edges)
    }, [microfrontends])

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
            console.log("onConnect", params)
            const newEdge = {
                ...params,
                markerEnd: {
                    type: "arrowclosed" as const,
                    width: 20,
                    height: 20
                }
            }
            await microfrontendApi.setRelation({ remote: params.source, host: params.target })
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

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onConnectEnd={onConnectEnd} fitView />
        </div>
    )
}

export default MicrofrontendFlowLayout
//edges={edges}
// onNodesChange={onNodesChange}
//                 onEdgesChange={onEdgesChange}
//                 onConnect={onConnect}
