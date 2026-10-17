import type { Market } from "@/hooks/apiClients/useMarketApi"

/** Market entries carry their kind in `type`; services are the ones tagged "service" (any casing). */
export const isServiceTemplate = (market: Pick<Market, "type">) => market.type?.toLowerCase() === "service"
