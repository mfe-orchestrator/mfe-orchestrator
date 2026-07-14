import { Suspense } from "react"
import Spinner from "./Spinner"

const RouteWithSuspense = ({ element: Element }: { element: React.ReactNode }) => <Suspense fallback={<Spinner />}>{Element}</Suspense>

export default RouteWithSuspense
