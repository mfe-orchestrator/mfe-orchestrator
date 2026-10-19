import { LocateFixed } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import ForceGraph2D, { ForceGraphMethods, LinkObject, NodeObject } from "react-force-graph-2d"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { Badge, Button } from "@/components/atoms"
import { Domain } from "@/hooks/apiClients/useDomainsApi"
import { Microfrontend } from "@/hooks/apiClients/useMicrofrontendsApi"
import { Service } from "@/hooks/apiClients/useServicesApi"

interface DomainGalaxyProps {
    domains: Domain[]
    microfrontends: Microfrontend[]
    services: Service[]
}

interface Star {
    id: string
    kind: "microfrontend" | "service"
    name: string
    slug: string
    version?: string
    galaxyId: string
    /** Share of the traffic on the canary, only while one is on */
    canary?: number
    radius: number
}

interface Lane {
    from: string
    to: string
    kind: "relation" | "service"
    /** Between members of two different galaxies */
    bridge: boolean
}

interface Galaxy {
    id: string
    name: string
    /** Missing on the galaxy of the members in no domain */
    domainId?: string
    caption: string
    hue: string
    anchor: { x: number; y: number }
}

type StarNode = NodeObject<Star>
type LaneLink = LinkObject<Star, Lane>

/** The d3 forces force-graph creates, only as far as they are tuned here */
interface LinkForce {
    distance(accessor: (link: LaneLink) => number): LinkForce
    strength(accessor: (link: LaneLink) => number): LinkForce
}
interface ChargeForce {
    strength(value: number): ChargeForce
    distanceMax(value: number): ChargeForce
}

const NO_DOMAIN = "no-domain"

/** Colours as HSL components, so each use can add its own alpha. The space stays dark in both themes. */
const SPACE_COLOR = "#070b1a"
const FALLBACK_PRIMARY = "262 83% 66%"
const SERVICE_HUE = "199 89% 60%"
const CANARY_HUE = "48 96% 60%"
const BRIDGE_HUE = "330 85% 70%"
const NO_DOMAIN_HUE = "220 10% 60%"
const GALAXY_HUES = ["262 83% 66%", "173 80% 45%", "217 91% 60%", "142 70% 45%", "24 95% 55%", "190 90% 50%"]

const GALAXY_PULL = 0.12
const LANE_DISTANCE = 36
const BRIDGE_DISTANCE = 260
const GALAXY_PADDING = 26
const EMPTY_GALAXY_RADIUS = 40
const GALAXY_HIT_REACH = 1.6
const STAR_LABEL_ZOOM = 1.4
const DIMMED_ALPHA = 0.15
const FIT_MS = 600
// Room for the halo and the two label lines over the outermost galaxies
const FIT_PADDING = 110
const MAX_GALAXY_ZOOM = 4
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** A fixed sky: seeded, so the stars do not jump around at every mount. */
const BACKGROUND_STARS = (() => {
    let seed = 7
    const random = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
    }
    return Array.from({ length: 180 }, () => ({ x: random(), y: random(), size: random() < 0.9 ? 1 : 2, alpha: 0.15 + random() * 0.5 }))
})()

const readPrimaryHue = () => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || FALLBACK_PRIMARY
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * The whole project as a sky: every domain a galaxy, its microfrontends and services the stars in it,
 * members in no domain in a grey nebula. Links across two domains are drawn as bridges between the
 * galaxies, the ones the domain diagram has to leave out.
 */
export const DomainGalaxy: React.FC<DomainGalaxyProps> = ({ domains, microfrontends, services }) => {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const graphRef = useRef<ForceGraphMethods<StarNode, LaneLink>>(undefined)
    const containerRef = useRef<HTMLDivElement>(null)
    const previousNodesRef = useRef<StarNode[]>([])
    const geometryRef = useRef(new Map<string, { x: number; y: number; r: number }>())
    const fittedRef = useRef(false)

    const [size, setSize] = useState({ width: 0, height: 0 })
    const [hovered, setHovered] = useState<{ node: StarNode; x: number; y: number } | null>(null)
    const [focusedGalaxyId, setFocusedGalaxyId] = useState<string | null>(null)
    const [primaryHue] = useState(readPrimaryHue)
    const [reducedMotion] = useState(prefersReducedMotion)
    const [font] = useState(() => getComputedStyle(document.body).fontFamily)

    useEffect(() => {
        const element = containerRef.current
        if (!element) return
        const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const { galaxies, graphData, membersByGalaxy } = useMemo(() => {
        const domainIds = new Set(domains.map(domain => domain._id))
        const galaxyOf = (domainId?: string | null) => (domainId && domainIds.has(domainId) ? domainId : NO_DOMAIN)

        const members = [
            ...microfrontends.map(mfe => ({
                id: mfe._id!,
                kind: "microfrontend" as const,
                name: mfe.name,
                slug: mfe.slug,
                version: mfe.version,
                galaxyId: galaxyOf(mfe.domainId),
                canary: mfe.canary?.enabled ? mfe.canary.percentage : undefined
            })),
            ...services.map(service => ({
                id: service._id!,
                kind: "service" as const,
                name: service.name,
                slug: service.slug,
                version: service.version,
                galaxyId: galaxyOf(service.domainId),
                canary: undefined
            }))
        ]
        const galaxyById = new Map(members.map(member => [member.id, member.galaxyId]))

        // Links to something that is not on the map are left out: there is no star to draw them to.
        const lanes: Lane[] = [
            ...microfrontends.flatMap(mfe => (mfe.parentIds ?? []).filter(parentId => galaxyById.has(parentId)).map(parentId => ({ from: parentId, to: mfe._id!, kind: "relation" as const }))),
            ...microfrontends.flatMap(mfe => (mfe.serviceIds ?? []).filter(serviceId => galaxyById.has(serviceId)).map(serviceId => ({ from: mfe._id!, to: serviceId, kind: "service" as const })))
        ].map(lane => ({ ...lane, bridge: galaxyById.get(lane.from) !== galaxyById.get(lane.to) }))

        const degree = new Map<string, number>()
        for (const lane of lanes) {
            degree.set(lane.from, (degree.get(lane.from) ?? 0) + 1)
            degree.set(lane.to, (degree.get(lane.to) ?? 0) + 1)
        }

        const countIn = (galaxyId: string, kind: Star["kind"]) => members.filter(member => member.galaxyId === galaxyId && member.kind === kind).length
        const caption = (galaxyId: string) => `${t("domains.frontend_count", { count: countIn(galaxyId, "microfrontend") })} · ${t("domains.backend_count", { count: countIn(galaxyId, "service") })}`
        const galaxyList = [
            ...domains.map((domain, index) => ({ id: domain._id, name: domain.name, domainId: domain._id, caption: caption(domain._id), hue: GALAXY_HUES[index % GALAXY_HUES.length] })),
            ...(members.some(member => member.galaxyId === NO_DOMAIN) ? [{ id: NO_DOMAIN, name: t("domains.no_domain"), caption: caption(NO_DOMAIN), hue: NO_DOMAIN_HUE }] : [])
        ]

        // The galaxies sit on a ring, far enough apart for the biggest one to keep clear of its neighbours.
        const biggest = Math.max(1, ...galaxyList.map(galaxy => members.filter(member => member.galaxyId === galaxy.id).length))
        const spacing = 150 + 24 * Math.sqrt(biggest)
        const ringRadius = galaxyList.length > 1 ? spacing / (2 * Math.sin(Math.PI / galaxyList.length)) : 0
        const galaxies: Galaxy[] = galaxyList.map((galaxy, index) => {
            const angle = -Math.PI / 2 + (index * 2 * Math.PI) / galaxyList.length
            return { ...galaxy, anchor: { x: ringRadius * Math.cos(angle), y: ringRadius * Math.sin(angle) } }
        })
        const anchors = new Map(galaxies.map(galaxy => [galaxy.id, galaxy.anchor]))

        // A star keeps the place it had before a reload; a new one starts on a spiral around its galaxy.
        const previous = new Map(previousNodesRef.current.map(node => [node.id, node]))
        const placed = new Map<string, number>()
        const nodes: StarNode[] = members.map(member => {
            const index = placed.get(member.galaxyId) ?? 0
            placed.set(member.galaxyId, index + 1)
            const anchor = anchors.get(member.galaxyId)!
            const before = previous.get(member.id)
            return {
                ...member,
                radius: 3 + Math.sqrt(degree.get(member.id) ?? 0) * 1.6,
                x: before?.x ?? anchor.x + 14 * Math.sqrt(index + 1) * Math.cos(index * GOLDEN_ANGLE),
                y: before?.y ?? anchor.y + 14 * Math.sqrt(index + 1) * Math.sin(index * GOLDEN_ANGLE)
            }
        })

        const membersByGalaxy = new Map(galaxies.map(galaxy => [galaxy.id, nodes.filter(node => node.galaxyId === galaxy.id)]))
        return { galaxies, membersByGalaxy, graphData: { nodes, links: lanes.map<LaneLink>(lane => ({ ...lane, source: lane.from, target: lane.to })) } }
    }, [domains, microfrontends, services, t])

    useEffect(() => {
        previousNodesRef.current = graphData.nodes
    }, [graphData])

    const hasBridges = graphData.links.some(link => link.bridge)
    const animated = !reducedMotion && (hasBridges || graphData.nodes.some(node => node.canary !== undefined))
    // The graph is only rendered once the container has a size, and the forces need it in place.
    const isGraphMounted = size.width > 0

    useEffect(() => {
        const graph = graphRef.current
        if (!isGraphMounted || !graph) return
        const anchors = new Map(galaxies.map(galaxy => [galaxy.id, galaxy.anchor]))
        let nodes: StarNode[] = []
        // Pulls every star towards the centre of its galaxy, so the domains hold together as clusters.
        const galaxyForce = Object.assign(
            (alpha: number) => {
                for (const node of nodes) {
                    const anchor = anchors.get(node.galaxyId)
                    if (!anchor) continue
                    node.vx = (node.vx ?? 0) + (anchor.x - (node.x ?? 0)) * GALAXY_PULL * alpha
                    node.vy = (node.vy ?? 0) + (anchor.y - (node.y ?? 0)) * GALAXY_PULL * alpha
                }
            },
            { initialize: (initialNodes: StarNode[]) => (nodes = initialNodes) }
        )
        graph.d3Force("galaxy", galaxyForce)
        graph.d3Force("center", null)
        // A bridge barely pulls, or two linked domains would merge into one galaxy.
        const linkForce = graph.d3Force("link") as unknown as LinkForce | undefined
        linkForce?.distance(link => (link.bridge ? BRIDGE_DISTANCE : LANE_DISTANCE)).strength(link => (link.bridge ? 0.01 : 0.25))
        const chargeForce = graph.d3Force("charge") as unknown as ChargeForce | undefined
        chargeForce?.strength(-45).distanceMax(220)
        graph.d3ReheatSimulation()
    }, [galaxies, isGraphMounted])

    const neighbourIds = useMemo(() => {
        if (!hovered) return null
        const ids = new Set([hovered.node.id])
        for (const link of graphData.links) {
            if (link.from === hovered.node.id) ids.add(link.to)
            if (link.to === hovered.node.id) ids.add(link.from)
        }
        return ids
    }, [hovered, graphData])

    const fitAll = useCallback(() => {
        setFocusedGalaxyId(null)
        if (graphData.nodes.length) graphRef.current?.zoomToFit(FIT_MS, FIT_PADDING)
    }, [graphData])

    const onEngineStop = useCallback(() => {
        if (fittedRef.current) return
        fittedRef.current = true
        fitAll()
    }, [fitAll])

    const onRenderFramePre = useCallback(
        (ctx: CanvasRenderingContext2D, scale: number) => {
            // The sky is drawn in screen pixels, so it stays put while the map pans and zooms.
            ctx.save()
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            const ratio = window.devicePixelRatio || 1
            for (const star of BACKGROUND_STARS) {
                ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`
                ctx.fillRect(star.x * ctx.canvas.width, star.y * ctx.canvas.height, star.size * ratio, star.size * ratio)
            }
            ctx.restore()

            const geometry = new Map<string, { x: number; y: number; r: number }>()
            for (const galaxy of galaxies) {
                const members = membersByGalaxy.get(galaxy.id) ?? []
                const x = members.length ? members.reduce((sum, node) => sum + (node.x ?? 0), 0) / members.length : galaxy.anchor.x
                const y = members.length ? members.reduce((sum, node) => sum + (node.y ?? 0), 0) / members.length : galaxy.anchor.y
                const r = members.length ? Math.max(...members.map(node => Math.hypot((node.x ?? 0) - x, (node.y ?? 0) - y) + node.radius)) + GALAXY_PADDING : EMPTY_GALAXY_RADIUS
                geometry.set(galaxy.id, { x, y, r })

                const halo = ctx.createRadialGradient(x, y, 0, x, y, r)
                halo.addColorStop(0, `hsl(${galaxy.hue} / 0.32)`)
                halo.addColorStop(0.6, `hsl(${galaxy.hue} / 0.12)`)
                halo.addColorStop(1, `hsl(${galaxy.hue} / 0)`)
                ctx.fillStyle = halo
                ctx.beginPath()
                ctx.arc(x, y, r, 0, 2 * Math.PI)
                ctx.fill()

                if (galaxy.id === focusedGalaxyId || !galaxy.domainId) {
                    ctx.strokeStyle = `hsl(${galaxy.hue} / ${galaxy.id === focusedGalaxyId ? 0.7 : 0.35})`
                    ctx.lineWidth = 1 / scale
                    ctx.setLineDash(galaxy.domainId ? [] : [4 / scale, 4 / scale])
                    ctx.stroke()
                    ctx.setLineDash([])
                }

                // Labels keep the same size on screen at every zoom.
                ctx.textAlign = "center"
                ctx.textBaseline = "bottom"
                ctx.fillStyle = "rgba(255, 255, 255, 0.9)"
                ctx.font = `600 ${14 / scale}px ${font}`
                ctx.fillText(galaxy.name, x, y - r - 18 / scale)
                ctx.fillStyle = "rgba(255, 255, 255, 0.55)"
                ctx.font = `${11 / scale}px ${font}`
                ctx.fillText(galaxy.caption, x, y - r - 4 / scale)
            }
            geometryRef.current = geometry
        },
        [galaxies, membersByGalaxy, focusedGalaxyId, font]
    )

    const paintStar = useCallback(
        (node: StarNode, ctx: CanvasRenderingContext2D, scale: number) => {
            const x = node.x ?? 0
            const y = node.y ?? 0
            const r = node.radius
            const hue = node.kind === "service" ? SERVICE_HUE : primaryHue
            const highlighted = neighbourIds?.has(node.id) ?? false
            ctx.globalAlpha = neighbourIds && !highlighted ? DIMMED_ALPHA : 1

            const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3)
            glow.addColorStop(0, `hsl(${hue} / 0.45)`)
            glow.addColorStop(1, `hsl(${hue} / 0)`)
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.arc(x, y, r * 3, 0, 2 * Math.PI)
            ctx.fill()

            ctx.fillStyle = `hsl(${hue})`
            ctx.beginPath()
            ctx.arc(x, y, r, 0, 2 * Math.PI)
            ctx.fill()
            ctx.fillStyle = "rgba(255, 255, 255, 0.85)"
            ctx.beginPath()
            ctx.arc(x, y, r * 0.4, 0, 2 * Math.PI)
            ctx.fill()

            // The canary is a ring as wide as its share of the traffic, pulsing unless motion is reduced.
            if (node.canary !== undefined) {
                const pulse = reducedMotion ? 1 : (Math.sin(performance.now() / 400) + 1) / 2
                ctx.strokeStyle = `hsl(${CANARY_HUE} / ${0.35 + 0.5 * pulse})`
                ctx.lineWidth = 1.2
                ctx.beginPath()
                ctx.arc(x, y, r + 2.5 + (node.canary / 100) * 5, 0, 2 * Math.PI)
                ctx.stroke()
            }

            if (scale >= STAR_LABEL_ZOOM || highlighted) {
                ctx.textAlign = "center"
                ctx.textBaseline = "top"
                ctx.fillStyle = "rgba(255, 255, 255, 0.85)"
                ctx.font = `${11 / scale}px ${font}`
                ctx.fillText(node.name, x, y + r + 3)
            }
            ctx.globalAlpha = 1
        },
        [primaryHue, neighbourIds, reducedMotion, font]
    )

    const paintPointerArea = useCallback((node: StarNode, color: string, ctx: CanvasRenderingContext2D) => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(node.x ?? 0, node.y ?? 0, node.radius + 2, 0, 2 * Math.PI)
        ctx.fill()
    }, [])

    const laneHue = useCallback((link: LaneLink) => (link.bridge ? BRIDGE_HUE : link.kind === "service" ? SERVICE_HUE : primaryHue), [primaryHue])
    const isLit = useCallback((link: LaneLink) => neighbourIds !== null && (link.from === hovered?.node.id || link.to === hovered?.node.id), [neighbourIds, hovered])

    const linkColor = useCallback(
        (link: LaneLink) => {
            const alpha = neighbourIds ? (isLit(link) ? 0.95 : 0.06) : link.bridge ? 0.75 : link.kind === "service" ? 0.35 : 0.4
            return `hsl(${laneHue(link)} / ${alpha})`
        },
        [neighbourIds, isLit, laneHue]
    )

    const onNodeHover = useCallback((node: StarNode | null) => {
        const graph = graphRef.current
        if (!node || !graph) return setHovered(null)
        const position = graph.graph2ScreenCoords(node.x ?? 0, node.y ?? 0)
        setHovered({ node, x: position.x, y: position.y })
    }, [])

    const onNodeClick = useCallback((node: StarNode) => navigate(node.kind === "service" ? `/service/${node.id}` : `/microfrontend/${node.id}`), [navigate])

    // A first click on a galaxy flies to it, a second one opens the domain; a click on empty space shows everything again.
    const onBackgroundClick = useCallback(
        (event: MouseEvent) => {
            const graph = graphRef.current
            if (!graph) return
            const point = graph.screen2GraphCoords(event.offsetX, event.offsetY)
            // The nearest galaxy, reached also a little beyond its halo, where its labels are.
            const distance = (galaxy: Galaxy) => {
                const geometry = geometryRef.current.get(galaxy.id)
                return geometry ? Math.hypot(point.x - geometry.x, point.y - geometry.y) / (geometry.r * GALAXY_HIT_REACH) : Infinity
            }
            const hit = galaxies.filter(galaxy => distance(galaxy) <= 1).sort((a, b) => distance(a) - distance(b))[0]
            if (!hit) return fitAll()
            if (hit.id === focusedGalaxyId && hit.domainId) return navigate(`/domain/${hit.domainId}`)
            const geometry = geometryRef.current.get(hit.id)!
            setFocusedGalaxyId(hit.id)
            graph.centerAt(geometry.x, geometry.y, FIT_MS)
            graph.zoom(Math.min(MAX_GALAXY_ZOOM, Math.min(size.width, size.height) / (2.6 * geometry.r)), FIT_MS)
        },
        [galaxies, focusedGalaxyId, fitAll, navigate, size]
    )

    const hoveredGalaxy = hovered && galaxies.find(galaxy => galaxy.id === hovered.node.galaxyId)

    return (
        <div
            ref={containerRef}
            className="relative h-[calc(100vh-300px)] min-h-[420px] overflow-hidden rounded-lg border-2 border-border"
            style={{ backgroundColor: SPACE_COLOR }}
            onMouseLeave={() => setHovered(null)}
        >
            <p className="sr-only">{t("domains.galaxy.summary", { count: graphData.links.filter(link => link.bridge).length })}</p>
            {isGraphMounted && (
                <ForceGraph2D<StarNode, LaneLink>
                    ref={graphRef}
                    width={size.width}
                    height={size.height}
                    graphData={graphData}
                    backgroundColor={SPACE_COLOR}
                    nodeCanvasObject={paintStar}
                    nodePointerAreaPaint={paintPointerArea}
                    linkColor={linkColor}
                    linkWidth={link => (isLit(link) ? 1.6 : link.bridge ? 1.4 : 0.8)}
                    linkLineDash={link => (link.kind === "service" ? [3, 2] : null)}
                    linkCurvature={link => (link.bridge ? 0.15 : 0)}
                    linkDirectionalParticles={link => (!reducedMotion && (link.bridge || isLit(link)) ? 2 : 0)}
                    linkDirectionalParticleSpeed={0.005}
                    linkDirectionalParticleWidth={2.2}
                    linkDirectionalParticleColor={link => `hsl(${laneHue(link)})`}
                    onRenderFramePre={onRenderFramePre}
                    onNodeHover={onNodeHover}
                    onNodeClick={onNodeClick}
                    onBackgroundClick={onBackgroundClick}
                    onEngineStop={onEngineStop}
                    // The tooltip is placed in screen pixels, so it would drift away from its star.
                    onZoom={() => setHovered(null)}
                    enableNodeDrag={false}
                    autoPauseRedraw={!animated}
                    warmupTicks={reducedMotion ? 300 : 0}
                    cooldownTicks={reducedMotion ? 0 : Infinity}
                    cooldownTime={4000}
                    minZoom={0.2}
                    maxZoom={8}
                />
            )}

            <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-4 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium shadow-sm">
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
                    {t("domains.detail.frontend_title")}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full bg-sky-400" aria-hidden="true" />
                    {t("domains.detail.backend_title")}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded-full border-2 border-yellow-400" aria-hidden="true" />
                    {t("domains.galaxy.legend_canary")}
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-0.5 w-4 rounded-full bg-pink-400" aria-hidden="true" />
                    {t("domains.galaxy.legend_bridge")}
                </span>
            </div>
            <Button variant="secondary" size="icon" className="absolute top-3 right-3" aria-label={t("domains.galaxy.recenter")} title={t("domains.galaxy.recenter")} onClick={fitAll}>
                <LocateFixed />
            </Button>
            <p className="pointer-events-none absolute right-3 bottom-3 max-w-sm rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground-secondary shadow-sm">
                {t("domains.galaxy.hint")}
            </p>

            {hovered && (
                <div
                    className="pointer-events-none absolute z-10 min-w-48 -translate-x-1/2 rounded-md border border-border bg-card px-3 py-2 text-xs shadow-md"
                    style={{ left: hovered.x, top: hovered.y + hovered.node.radius * 2 + 16 }}
                >
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-card-foreground">{hovered.node.name}</span>
                        {hovered.node.version && <Badge variant="outline">{hovered.node.version}</Badge>}
                    </div>
                    <div className="text-foreground-secondary">{hovered.node.slug}</div>
                    <div className="mt-1 text-foreground-secondary">
                        {t(hovered.node.kind === "service" ? "domains.galaxy.kind_service" : "domains.galaxy.kind_microfrontend")}
                        {hoveredGalaxy && ` · ${hoveredGalaxy.name}`}
                    </div>
                    {hovered.node.canary !== undefined && (
                        <div className="mt-1 font-medium text-yellow-600 dark:text-yellow-400">{t("domains.galaxy.canary", { percentage: hovered.node.canary })}</div>
                    )}
                </div>
            )}
        </div>
    )
}

export default DomainGalaxy
