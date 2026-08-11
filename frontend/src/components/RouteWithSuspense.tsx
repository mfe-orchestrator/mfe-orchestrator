import { Spinner } from "@mfe-orchestrator/design-system"
import { Suspense } from "react"

const RouteWithSuspense = ({ element: Element }: { element: React.ReactNode }) => <Suspense fallback={<Spinner />}>{Element}</Suspense>

export default RouteWithSuspense
